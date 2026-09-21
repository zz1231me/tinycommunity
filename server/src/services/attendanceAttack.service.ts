// 퇴근 공격권·방어권. 출퇴근 기록은 절대 건드리지 않는다.

import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../config/sequelize';
import AttendanceAttackModel, { AttendanceAttack } from '../models/AttendanceAttack';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { UserPoint } from '../models/UserPoint';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import {
  apply,
  ensureBalanceRow,
  lockBalance,
  lockBothBalances,
  today,
  withLockRetry,
} from './point.service';
import {
  ATTACK_MAX_STACK,
  ATTACK_NAME,
  HIDE_TOTAL_MAX_SECONDS,
  attackCost,
  attackSeconds,
  isAttackKind,
  type AttackKind,
} from '../config/attendanceAttack';
import { getAttackSettings } from '../utils/settingsCache';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

const withAttacker = { model: User, as: 'attacker', attributes: ['id', 'name'] };

function nameOf(row: AttendanceAttackModel): string {
  const joined = row as unknown as { attacker?: { name?: string } };
  return joined.attacker?.name ?? row.attackerId;
}

/** 이 공격의 시작 시각. startsAt 칸이 생기기 전의 행은 만든 시각이 시작이다. */
function startOf(row: AttendanceAttackModel): number {
  return (row.startsAt ?? row.createdAt).getTime();
}

/** 살아 있는 공격들을 차례대로. 맨 앞이 지금 걸려 있는 것이다. */
async function liveQueue(targetId: string, t?: Transaction): Promise<AttendanceAttackModel[]> {
  const rows = await AttendanceAttack.findAll({
    where: {
      targetId,
      defendedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    include: [withAttacker],
    transaction: t,
  });
  return rows.sort((a, b) => startOf(a) - startOf(b) || a.id - b.id);
}

function queueView(row: AttendanceAttackModel) {
  return {
    id: row.id,
    attackerId: row.attackerId,
    attackerName: nameOf(row),
    kind: row.kind,
    startsAt: new Date(startOf(row)),
    expiresAt: row.expiresAt,
  };
}

/** 지금 근무 중인가. 근무일은 오늘·어제로만 묶는다. */
async function isWorking(userId: string, t?: Transaction): Promise<boolean> {
  // checkOut 이 닫을 기록과 같은 기록을 본다. 오늘 것이 있으면 그것, 없을 때만 어제 것.
  const todays = await AttendanceRecord.findOne({
    where: { UserId: userId, workDate: today() },
    attributes: ['id', 'checkOutAt'],
    transaction: t,
    // 잠그지 않고 읽으면 확인 직후의 퇴근을 막지 못한다. 잠금 순서는 늘 user_points → 이 줄.
    ...(t ? { lock: t.LOCK.UPDATE } : {}),
  });
  if (todays) return todays.checkOutAt === null;

  const carried = await AttendanceRecord.findOne({
    where: {
      UserId: userId,
      checkOutAt: null,
      workDate: today(new Date(Date.now() - 86_400_000)),
    },
    attributes: ['id'],
    transaction: t,
    ...(t ? { lock: t.LOCK.UPDATE } : {}),
  });
  return carried !== null;
}

/** 알림은 포인트 정산 트랜잭션과 묶지 않는다. */
function notify(userId: string, message: string, attackId: number, link: string): void {
  void notificationService
    .create({
      userId,
      type: 'ATTACK',
      message,
      link,
      relatedId: String(attackId),
    })
    .catch(err => logError('퇴근 공격 알림 생성 실패', err, { userId, attackId }));
}

export const attendanceAttackService = {
  /** 나에게 걸린 공격과 내가 남은 횟수 */
  async state(userId: string) {
    const rules = getAttackSettings();
    const [queue, balanceRow, usedToday] = await Promise.all([
      liveQueue(userId),
      UserPoint.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      AttendanceAttack.count({ where: { attackerId: userId, workDate: today() } }),
    ]);

    return {
      /** 지금 서버 시각. 화면은 자기 시계와의 차이를 재서 남은 시간을 센다. */
      now: new Date(),
      rules: {
        cost: rules.cost,
        hideCost: rules.hideCost,
        defendCost: rules.defendCost,
        blockSeconds: rules.blockSeconds,
        hideSeconds: rules.hideSeconds,
        dailyLimit: rules.dailyLimitPerAttacker,
        maxStack: ATTACK_MAX_STACK,
      },
      balance: balanceRow?.balance ?? 0,
      /** 지금 걸려 있는 공격. 줄의 맨 앞이며 없으면 null. */
      incoming: queue[0] ? queueView(queue[0]) : null,
      /** 쌓여 있는 공격 전부, 차례대로 */
      queue: queue.map(queueView),
      usedToday,
      remainingToday: Math.max(0, rules.dailyLimitPerAttacker - usedToday),
    };
  },

  /** 공격권을 사서 바로 쓴다 */
  async attack(attackerId: string, input: { targetId: string; kind?: string }) {
    const rules = getAttackSettings();
    const kind: AttackKind = isAttackKind(input.kind) ? input.kind : 'chaos';

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
    if (!(await isWorking(targetId))) {
      throw new AppError(400, '지금 근무 중인 사람에게만 쓸 수 있습니다.');
    }
    // 대상의 잔액 행을 잠금 지점으로 쓰므로 미리 만들어 둔다.
    await ensureBalanceRow(attackerId);
    await ensureBalanceRow(targetId);
    const cost = attackCost(kind, rules);

    const result = await withLockRetry(() =>
      sequelize.transaction(async t => {
        const day = today();

        // 세기 전에 두 사람을 먼저 잠근다. count 만으로는 동시 요청을 막지 못한다.
        // 잠금은 아이디 순으로 고정해 A↔B 교착을 피한다.
        const rows = await lockBothBalances(attackerId, targetId, t);

        const used = await AttendanceAttack.count({
          where: { attackerId, workDate: day },
          transaction: t,
        });
        if (used >= rules.dailyLimitPerAttacker) {
          throw new AppError(429, `오늘은 ${rules.dailyLimitPerAttacker}번을 모두 사용했습니다.`);
        }

        const queue = await liveQueue(targetId, t);
        if (queue.length >= ATTACK_MAX_STACK) {
          throw new AppError(409, `이미 공격이 ${ATTACK_MAX_STACK}개 쌓여 있습니다.`);
        }

        // 잠근 뒤에 다시 확인한다. 위의 확인은 잠금 밖이라 그 사이에 퇴근할 수 있다.
        if (!(await isWorking(targetId, t))) {
          throw new AppError(400, '지금 근무 중인 사람에게만 쓸 수 있습니다.');
        }

        // 숨기기는 실제로 누를 수 없으므로 쌓인 시간의 합에 상한을 둔다.
        if (kind === 'hide') {
          const now = Date.now();
          const queuedHideMs = queue
            .filter(q => q.kind === 'hide')
            .reduce(
              (sum, q) => sum + Math.max(0, q.expiresAt.getTime() - Math.max(now, startOf(q))),
              0
            );
          const lifeMs = attackSeconds(kind, rules) * 1000;
          if (queuedHideMs + lifeMs > HIDE_TOTAL_MAX_SECONDS * 1000) {
            throw new AppError(
              409,
              `숨기기는 한 번에 ${HIDE_TOTAL_MAX_SECONDS}초까지만 쌓을 수 있습니다. 방해나 문제 내기를 써 보세요.`
            );
          }
        }

        const row = rows[attackerId];
        if (row.balance < cost) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. ${cost.toLocaleString()}P 가 필요합니다 (보유 ${row.balance.toLocaleString()}P).`
          );
        }
        await apply(row, -cost, 'attack_cost', ATTACK_NAME[kind], t);

        const lifeMs = attackSeconds(kind, rules) * 1000;
        // 줄 맨 끝 공격이 끝난 뒤에 시작한다. 줄이 비었으면 지금.
        const last = queue[queue.length - 1];
        const startsAt = new Date(Math.max(Date.now(), last ? last.expiresAt.getTime() : 0));

        const made = await AttendanceAttack.create(
          {
            attackerId,
            targetId,
            workDate: day,
            kind,
            startsAt,
            expiresAt: new Date(startsAt.getTime() + lifeMs),
          },
          { transaction: t }
        );
        return { made, stack: queue.length + 1 };
      })
    );

    const { made: created, stack } = result;
    const attacker = await User.findByPk(attackerId, { attributes: ['id', 'name'] });
    const who = attacker?.name ?? attackerId;
    notify(
      targetId,
      {
        chaos: `${who}님이 퇴근 방해를 걸었습니다!`,
        hide: `${who}님이 퇴근 버튼을 잠깐 숨겼습니다!`,
        quiz: `${who}님이 퇴근 버튼에 계산 문제를 걸었습니다! 풀어야 퇴근할 수 있어요`,
      }[kind] + (stack > 1 ? ` (쌓인 공격 ${stack}개)` : ''),
      created.id,
      // 출퇴근 화면은 대시보드 안에 있다. '/attendance' 는 없는 페이지다.
      '/dashboard/attendance'
    );

    return {
      id: created.id,
      targetId,
      kind,
      startsAt: created.startsAt,
      expiresAt: created.expiresAt,
      stack,
    };
  },

  /** 방어권 한 장으로 맨 앞의 공격 하나를 푼다. 뒤에 쌓인 공격은 앞으로 당겨진다. */
  async defend(userId: string, attackId: number) {
    const rules = getAttackSettings();
    await ensureBalanceRow(userId);

    const defended = await withLockRetry(() =>
      sequelize.transaction(async t => {
        // 잔액 행을 먼저 잠근다. attack 과 같은 순서여야 교착이 없다.
        const balance = await lockBalance(userId, t);

        const row = await AttendanceAttack.findByPk(attackId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!row) throw new AppError(404, '공격을 찾을 수 없습니다.');
        if (row.targetId !== userId) throw new AppError(403, '나에게 걸린 공격이 아닙니다.');
        // 잠근 뒤 다시 확인한다. 동시에 두 번 누르면 값을 두 번 치른다.
        if (row.defendedAt) throw new AppError(409, '이미 방어했습니다.');
        if (row.expiresAt.getTime() <= Date.now()) {
          throw new AppError(409, '이미 풀린 공격입니다.');
        }

        const queue = await liveQueue(userId, t);
        if (queue[0]?.id !== row.id) {
          throw new AppError(409, '지금 걸려 있는 공격부터 풀 수 있습니다.');
        }

        if (balance.balance < rules.defendCost) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. 방어권은 ${rules.defendCost.toLocaleString()}P 입니다 (보유 ${balance.balance.toLocaleString()}P).`
          );
        }
        await apply(balance, -rules.defendCost, 'defend_cost', '퇴근 방어권', t);

        const now = Date.now();
        row.defendedAt = new Date(now);
        await row.save({ transaction: t });

        // 뒤에 쌓인 공격을 지금부터 다시 이어 붙인다. 그대로 두면 빈 틈이 생긴다.
        let cursor = now;
        for (const next of queue.slice(1)) {
          const length = next.expiresAt.getTime() - startOf(next);
          next.startsAt = new Date(cursor);
          next.expiresAt = new Date(cursor + length);
          cursor += length;
          await next.save({ transaction: t });
        }
        return { row, remaining: queue.length - 1 };
      })
    );

    const me = await User.findByPk(userId, { attributes: ['id', 'name'] });
    // 공격한 사람에게는 공격권이 있는 포인트 탭으로 보낸다.
    notify(
      defended.row.attackerId,
      `${me?.name ?? userId}님이 방어권을 사용했습니다.`,
      defended.row.id,
      '/profile?tab=points'
    );

    return { id: defended.row.id, remaining: defended.remaining };
  },
};
