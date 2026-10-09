// 포인트 절반 날리기. 성공하면 상대의 포인트 절반이 사라진다 — 아무에게도 가지 않는다.
// 누가 걸었는지는 상대에게 알리지 않는다. 기록(point_attacks)에는 남아 관리자가 볼 수 있다.

import crypto from 'crypto';
import { sequelize } from '../config/sequelize';
import PointAttackModel, { PointAttack } from '../models/PointAttack';
import { UserPoint } from '../models/UserPoint';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import {
  apply,
  ensureBalanceRow,
  lockBothBalances,
  runSerialPerUser,
  today,
  withLockRetry,
} from './point.service';
import { attacksUsedToday } from './attackQuota';
import { HALVE_ANONYMOUS, HALVE_NAME, lossOf } from '../config/pointAttack';
import { getAttackSettings, getPointAttackSettings } from '../utils/settingsCache';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

/** 1~100 중 하나. 테스트는 이 자리를 대신 넣어 결과를 정한다. */
function rollPercent(): number {
  return crypto.randomInt(0, 100) + 1;
}

function notifyVictim(userId: string, lost: number, attackId: number): void {
  void notificationService
    .create({
      userId,
      // 퇴근 공격과 섞이지 않게 종류를 따로 둔다. 끄고 켜는 것도 따로다.
      type: 'POINT_ATTACK',
      // 이름을 넣지 않는다. 익명이 이 기능의 규칙이다.
      message: `${HALVE_ANONYMOUS}의 공격으로 포인트 절반(${lost.toLocaleString()}P)이 사라졌습니다.`,
      // 링크를 두지 않는다. 포인트 화면은 /profile 의 탭이라 따로 들어갈 주소가 없고,
      // 없는 주소를 달아 두면 눌렀을 때 '페이지를 찾을 수 없습니다' 가 뜬다.
      // 당한 사실만 알리면 되는 알림이라 팝업과 벨에 남는 것으로 충분하다.
      relatedId: String(attackId),
    })
    .catch(err => logError('포인트 공격 알림 생성 실패', err, { userId, attackId }));
}

interface AttackLogRow {
  id: number;
  attackerId: string;
  attackerName: string;
  targetId: string;
  targetName: string;
  succeeded: boolean;
  cost: number;
  amountLost: number;
  createdAt: Date;
}

/** 한 번에 던질 수 있는 최대 횟수. 화면의 'x10' 과 같은 값이다. */
export const MAX_THROWS_AT_ONCE = 10;

const withNames = [
  { model: User, as: 'attacker', attributes: ['id', 'name'], required: false },
  { model: User, as: 'target', attributes: ['id', 'name'], required: false },
];

function nameOf(row: PointAttackModel, key: 'attacker' | 'target', fallback: string): string {
  const joined = row as unknown as Record<string, { name?: string } | undefined>;
  return joined[key]?.name ?? fallback;
}

/** 한 발 던지기 전에 한 번만 해 두면 되는 것들 */
interface ThrowContext {
  rules: ReturnType<typeof getAttackSettings>;
  point: ReturnType<typeof getPointAttackSettings>;
  target: { id: string; name: string };
  targetId: string;
}

/**
 * 상대를 찾고 잔액 행을 보장한다. 열 발을 던져도 한 번이면 된다 —
 * 매 발마다 하면 같은 사용자 조회가 열 번 나간다.
 */
async function prepareThrow(attackerId: string, rawTargetId: string): Promise<ThrowContext> {
  if (attackerId === rawTargetId) {
    throw new AppError(400, '자기 자신에게는 쓸 수 없습니다.');
  }

  const target = await User.findByPk(rawTargetId, {
    attributes: ['id', 'name', 'isActive', 'isDeleted'],
  });
  if (!target || !target.isActive || target.isDeleted) {
    throw new AppError(404, '상대를 찾을 수 없습니다.');
  }
  // 대소문자를 가리지 않는 DB 가 있으므로 입력값이 아니라 DB 가 돌려준 아이디를 쓴다.
  const targetId = target.id;
  if (attackerId === targetId) {
    throw new AppError(400, '자기 자신에게는 쓸 수 없습니다.');
  }

  await ensureBalanceRow(attackerId);
  await ensureBalanceRow(targetId);

  return {
    // 설정은 한 번 읽어 열 발이 같은 규칙으로 돌게 한다. 중간에 관리자가 바꿔도
    // 한 요청 안에서는 값이 흔들리지 않는다.
    rules: getAttackSettings(),
    point: getPointAttackSettings(),
    target: { id: target.id, name: target.name },
    targetId,
  };
}

export const pointAttackService = {
  /**
   * 관리자용 기록. 익명은 당한 사람에게만 지키는 규칙이고, 관리자는 누가 걸었는지 봐야 한다 —
   * 되돌릴 수 없는 공격이라 포인트가 사라진 건은 누가 걸었는지 남아 있어야 한다.
   *
   * 통한 것만 보여 준다. 빗나간 것은 100 건 중 99 건이라 목록을 덮어 버리고, 아무 일도
   * 일어나지 않은 일이다. 행 자체는 그대로 쌓이므로 필요해지면 조건만 풀면 된다.
   */
  async listForAdmin(params: { page?: number; limit?: number }): Promise<{
    rows: AttackLogRow[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    // 아주 큰 page 는 offset 이 지수 표기가 되어 DB 가 거절한다.
    const page = Math.min(1000, Math.max(1, params.page ?? 1));
    const limit = Math.min(Math.max(1, params.limit ?? 30), 100);

    const { rows, count } = await PointAttack.findAndCountAll({
      where: { succeeded: true },
      include: withNames,
      // 같은 시각이면 페이지 사이로 행이 새므로 id 로 확정 순서를 준다.
      order: [['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      rows: rows.map(row => ({
        id: row.id,
        attackerId: row.attackerId,
        attackerName: nameOf(row, 'attacker', row.attackerId),
        targetId: row.targetId,
        targetName: nameOf(row, 'target', row.targetId),
        succeeded: row.succeeded,
        cost: row.cost,
        amountLost: row.amountLost,
        createdAt: row.createdAt,
      })),
      total: count,
      page,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    };
  },

  /** 값과 확률, 오늘 남은 횟수 */
  async state(userId: string) {
    const rules = getAttackSettings();
    const point = getPointAttackSettings();
    const [balanceRow, usedToday] = await Promise.all([
      UserPoint.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      attacksUsedToday(userId, today()),
    ]);
    return {
      cost: point.cost,
      successPercent: point.successPercent,
      lossPercent: point.lossPercent,
      balance: balanceRow?.balance ?? 0,
      dailyLimit: rules.dailyLimitPerAttacker,
      usedToday,
      remainingToday: Math.max(0, rules.dailyLimitPerAttacker - usedToday),
    };
  },

  /**
   * 여러 번 이어 던진다. 한 번에 한 요청으로 끝내기 위한 것 —
   * 열 번 던지자고 열 번 부르면 같은 사람의 요청이 겹쳐 트랜잭션이 줄을 선다.
   * 중간에 횟수나 포인트가 떨어지면 거기까지 한 결과를 돌려준다(이미 던진 것은 되돌리지 않는다).
   */
  async halveMany(
    attackerId: string,
    input: { targetId: string; count: number },
    roll: () => number = rollPercent
  ) {
    const count = Math.min(MAX_THROWS_AT_ONCE, Math.max(1, Math.floor(input.count)));
    const throws: Array<{ succeeded: boolean; lost: number }> = [];
    let last: Awaited<ReturnType<typeof pointAttackService.throwOnce>> | null = null;
    let stopped: string | null = null;

    // 상대 조회와 잔액 행 보장은 한 번만. 열 발이면 열 번 하던 것이다.
    const ready = await prepareThrow(attackerId, input.targetId);

    for (let i = 0; i < count; i += 1) {
      try {
        last = await pointAttackService.throwOnce(attackerId, ready, roll);
        throws.push({ succeeded: last.succeeded, lost: last.lost });
      } catch (err) {
        // 첫 번째부터 막히면 평소처럼 오류를 돌려준다. 몇 번이라도 던졌으면 거기까지가 결과다.
        if (throws.length === 0) throw err;
        stopped = err instanceof AppError ? err.message : '더 던지지 못했습니다.';
        break;
      }
    }

    return {
      throws,
      stopped,
      targetName: last?.targetName ?? '',
      balance: last?.balance ?? 0,
    };
  },

  /**
   * 한 번 던진다. 실패해도 값은 돌려주지 않는다.
   * @param roll 테스트에서 결과를 정할 때만 넣는다. 1~100.
   */
  async halve(attackerId: string, input: { targetId: string }, roll: () => number = rollPercent) {
    const ready = await prepareThrow(attackerId, input.targetId);
    return pointAttackService.throwOnce(attackerId, ready, roll);
  },

  /**
   * 준비가 끝난 상태에서 한 발. halveMany 가 열 번 부를 때 상대 조회와 잔액 행 보장을
   * 되풀이하지 않도록 나눠 두었다.
   */
  async throwOnce(attackerId: string, ready: ThrowContext, roll: () => number = rollPercent) {
    const { rules, point, target, targetId } = ready;

    // 잠그기 전에 한 번 거른다. 이것이 없으면 하루 횟수를 넘긴 요청도 잔액 행을 잠그고 들어가,
    // 몰아칠 때 이미 틀린 요청들이 트랜잭션 줄을 메워 서로를 기다리게 만든다.
    // 아래 트랜잭션 안의 검사가 여전히 최종 판정이다 — 이것은 빨리 돌려보내기 위한 것뿐이다.
    if ((await attacksUsedToday(attackerId, today())) >= rules.dailyLimitPerAttacker) {
      throw new AppError(429, `오늘은 ${rules.dailyLimitPerAttacker}번을 모두 사용했습니다.`);
    }

    return runSerialPerUser(attackerId, () =>
      withLockRetry(() =>
        sequelize.transaction(async t => {
          const day = today();
          // 세기 전에 두 사람을 먼저 잠근다. count 만으로는 동시 요청을 막지 못한다.
          const rows = await lockBothBalances(attackerId, targetId, t);

          const used = await attacksUsedToday(attackerId, day, t);
          if (used >= rules.dailyLimitPerAttacker) {
            throw new AppError(429, `오늘은 ${rules.dailyLimitPerAttacker}번을 모두 사용했습니다.`);
          }

          const mine = rows[attackerId];
          if (mine.balance < point.cost) {
            throw new AppError(
              400,
              `포인트가 모자랍니다. ${point.cost.toLocaleString()}P 가 필요합니다 (보유 ${mine.balance.toLocaleString()}P).`
            );
          }
          await apply(mine, -point.cost, 'attack_cost', HALVE_NAME, t);

          const succeeded = roll() <= point.successPercent;
          const victim = rows[targetId];
          const lost = succeeded ? lossOf(victim.balance, point.lossPercent) : 0;
          if (lost > 0) {
            // memo 에도 이름을 남기지 않는다 — 원장은 당한 사람이 그대로 본다.
            await apply(victim, -lost, 'point_attack_loss', `${HALVE_ANONYMOUS}의 공격`, t);
          }

          const made = await PointAttack.create(
            { attackerId, targetId, workDate: day, cost: point.cost, succeeded, amountLost: lost },
            { transaction: t }
          );

          return { id: made.id, succeeded, lost, targetName: target.name, balance: mine.balance };
        })
      )
    ).then(result => {
      if (result.succeeded && result.lost > 0) notifyVictim(targetId, result.lost, result.id);
      return {
        succeeded: result.succeeded,
        lost: result.lost,
        targetName: result.targetName,
        balance: result.balance,
      };
    });
  },
};
