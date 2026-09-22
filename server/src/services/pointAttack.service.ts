// 포인트 절반 날리기. 성공하면 상대의 포인트 절반이 사라진다 — 아무에게도 가지 않는다.
// 누가 걸었는지는 상대에게 알리지 않는다. 기록(point_attacks)에는 남아 관리자가 볼 수 있다.

import crypto from 'crypto';
import { sequelize } from '../config/sequelize';
import PointAttackModel, { PointAttack } from '../models/PointAttack';
import { UserPoint } from '../models/UserPoint';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { apply, ensureBalanceRow, lockBothBalances, today, withLockRetry } from './point.service';
import { attacksUsedToday } from './attackQuota';
import {
  HALVE_ANONYMOUS,
  HALVE_COST,
  HALVE_NAME,
  HALVE_SUCCESS_PERCENT,
  halfOf,
} from '../config/pointAttack';
import { getAttackSettings } from '../utils/settingsCache';
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
      type: 'ATTACK',
      // 이름을 넣지 않는다. 익명이 이 기능의 규칙이다.
      message: `${HALVE_ANONYMOUS}의 공격으로 포인트 절반(${lost.toLocaleString()}P)이 사라졌습니다.`,
      link: '/dashboard/points',
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

const withNames = [
  { model: User, as: 'attacker', attributes: ['id', 'name'], required: false },
  { model: User, as: 'target', attributes: ['id', 'name'], required: false },
];

function nameOf(row: PointAttackModel, key: 'attacker' | 'target', fallback: string): string {
  const joined = row as unknown as Record<string, { name?: string } | undefined>;
  return joined[key]?.name ?? fallback;
}

export const pointAttackService = {
  /**
   * 관리자용 기록. 익명은 당한 사람에게만 지키는 규칙이고, 관리자는 누가 걸었는지 봐야 한다 —
   * 되돌릴 수 없는 공격이라 한 사람만 노리는 일이 생겨도 이 목록 말고는 알 길이 없다.
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
    const [balanceRow, usedToday] = await Promise.all([
      UserPoint.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      attacksUsedToday(userId, today()),
    ]);
    return {
      cost: HALVE_COST,
      successPercent: HALVE_SUCCESS_PERCENT,
      balance: balanceRow?.balance ?? 0,
      dailyLimit: rules.dailyLimitPerAttacker,
      usedToday,
      remainingToday: Math.max(0, rules.dailyLimitPerAttacker - usedToday),
    };
  },

  /**
   * 한 번 던진다. 실패해도 값은 돌려주지 않는다.
   * @param roll 테스트에서 결과를 정할 때만 넣는다. 1~100.
   */
  async halve(attackerId: string, input: { targetId: string }, roll: () => number = rollPercent) {
    const rules = getAttackSettings();

    if (attackerId === input.targetId) {
      throw new AppError(400, '자기 자신에게는 쓸 수 없습니다.');
    }

    const target = await User.findByPk(input.targetId, {
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

    return withLockRetry(() =>
      sequelize.transaction(async t => {
        const day = today();
        // 세기 전에 두 사람을 먼저 잠근다. count 만으로는 동시 요청을 막지 못한다.
        const rows = await lockBothBalances(attackerId, targetId, t);

        const used = await attacksUsedToday(attackerId, day, t);
        if (used >= rules.dailyLimitPerAttacker) {
          throw new AppError(429, `오늘은 ${rules.dailyLimitPerAttacker}번을 모두 사용했습니다.`);
        }

        const mine = rows[attackerId];
        if (mine.balance < HALVE_COST) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. ${HALVE_COST.toLocaleString()}P 가 필요합니다 (보유 ${mine.balance.toLocaleString()}P).`
          );
        }
        await apply(mine, -HALVE_COST, 'attack_cost', HALVE_NAME, t);

        const succeeded = roll() <= HALVE_SUCCESS_PERCENT;
        const victim = rows[targetId];
        const lost = succeeded ? halfOf(victim.balance) : 0;
        if (lost > 0) {
          // memo 에도 이름을 남기지 않는다 — 원장은 당한 사람이 그대로 본다.
          await apply(victim, -lost, 'point_attack_loss', `${HALVE_ANONYMOUS}의 공격`, t);
        }

        const made = await PointAttack.create(
          { attackerId, targetId, workDate: day, cost: HALVE_COST, succeeded, amountLost: lost },
          { transaction: t }
        );

        return { id: made.id, succeeded, lost, targetName: target.name, balance: mine.balance };
      })
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
