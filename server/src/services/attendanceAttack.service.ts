// server/src/services/attendanceAttack.service.ts
// 퇴근 공격권·방어권.
//
// ⚠️ 가장 중요한 성질부터: 이 서비스는 출퇴근 '기록' 을 건드리지 않는다.
//
// attendance.service 의 checkOut 은 이 표를 보지 않는다. 공격을 받는 중에 퇴근을
// 눌러도 그 순간이 그대로 기록된다. 잠기는 것은 화면의 버튼뿐이다.
// (테스트 '공격을 받는 중에도 퇴근은 그대로 기록된다' 가 이 성질을 붙잡고 있다.)
//
// 남이 내 근무 기록의 시각을 늦출 수 있게 되는 순간, 이 기능은 장난이 아니라
// 근태 분쟁거리가 된다. 그 선을 넘지 않는 것이 이 설계의 전부다.

import { Op } from 'sequelize';
import { sequelize } from '../config/sequelize';
import AttendanceAttackModel, { AttendanceAttack } from '../models/AttendanceAttack';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { UserPoint } from '../models/UserPoint';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { apply, ensureBalanceRow, lockBalance, today, withLockRetry } from './point.service';
import { ATTACK_RULES } from '../config/attendanceAttack';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

const withAttacker = { model: User, as: 'attacker', attributes: ['id', 'name'] };

function nameOf(row: AttendanceAttackModel): string {
  const joined = row as unknown as { attacker?: { name?: string } };
  return joined.attacker?.name ?? row.attackerId;
}

/** 지금 이 사람에게 걸려 있는 살아 있는 공격 */
async function liveAgainst(targetId: string): Promise<AttendanceAttackModel | null> {
  return AttendanceAttack.findOne({
    where: { targetId, defendedAt: null, expiresAt: { [Op.gt]: new Date() } },
    include: [withAttacker],
    order: [['id', 'DESC']],
  });
}

/** 지금 근무 중인가 — 퇴근을 앞둔 사람에게만 의미가 있는 장난이다 */
async function isWorking(userId: string): Promise<boolean> {
  const open = await AttendanceRecord.findOne({
    where: { UserId: userId, checkOutAt: null },
    attributes: ['id'],
  });
  return open !== null;
}

/** 알림은 포인트 정산과 묶지 않는다 — 알림이 실패해도 포인트는 이미 옳게 움직였다 */
function notify(userId: string, message: string, attackId: number): void {
  void notificationService
    .create({
      userId,
      type: 'ATTACK',
      message,
      link: '/attendance',
      relatedId: String(attackId),
    })
    .catch(err => logError('퇴근 공격 알림 생성 실패', err, { userId, attackId }));
}

function toView(row: AttendanceAttackModel) {
  return {
    id: row.id,
    attackerId: row.attackerId,
    attackerName: nameOf(row),
    expiresAt: row.expiresAt,
  };
}

export const attendanceAttackService = {
  /** 출근 화면이 물어보는 것 — 지금 나에게 걸린 공격이 있는가, 나는 몇 번 더 쓸 수 있는가 */
  async state(userId: string) {
    const [live, balanceRow, usedToday] = await Promise.all([
      liveAgainst(userId),
      UserPoint.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      AttendanceAttack.count({ where: { attackerId: userId, workDate: today() } }),
    ]);

    return {
      rules: {
        cost: ATTACK_RULES.cost,
        defendCost: ATTACK_RULES.defendCost,
        blockSeconds: ATTACK_RULES.blockSeconds,
        dailyLimit: ATTACK_RULES.dailyLimitPerAttacker,
      },
      balance: balanceRow?.balance ?? 0,
      /** 나에게 걸린 공격 (없으면 null) */
      incoming: live ? toView(live) : null,
      usedToday,
      remainingToday: Math.max(0, ATTACK_RULES.dailyLimitPerAttacker - usedToday),
    };
  },

  /** 공격권을 사서 바로 쓴다 */
  async attack(attackerId: string, targetId: string) {
    if (attackerId === targetId) {
      throw new AppError(400, '자기 자신에게는 쓸 수 없습니다.');
    }

    const target = await User.findByPk(targetId, {
      attributes: ['id', 'name', 'isActive', 'isDeleted'],
    });
    if (!target || !target.isActive || target.isDeleted) {
      throw new AppError(404, '상대를 찾을 수 없습니다.');
    }
    if (!(await isWorking(targetId))) {
      throw new AppError(400, '지금 근무 중인 사람에게만 쓸 수 있습니다.');
    }
    if (await liveAgainst(targetId)) {
      throw new AppError(409, '이미 공격받고 있는 사람입니다.');
    }

    await ensureBalanceRow(attackerId);

    const created = await withLockRetry(() =>
      sequelize.transaction(async t => {
        const day = today();
        const used = await AttendanceAttack.count({
          where: { attackerId, workDate: day },
          transaction: t,
        });
        if (used >= ATTACK_RULES.dailyLimitPerAttacker) {
          throw new AppError(
            429,
            `오늘은 ${ATTACK_RULES.dailyLimitPerAttacker}번을 모두 사용했습니다.`
          );
        }

        const row = await lockBalance(attackerId, t);
        if (row.balance < ATTACK_RULES.cost) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. 공격권은 ${ATTACK_RULES.cost.toLocaleString()}P 입니다 (보유 ${row.balance.toLocaleString()}P).`
          );
        }
        await apply(row, -ATTACK_RULES.cost, 'attack_cost', '퇴근 공격권', t);

        return AttendanceAttack.create(
          {
            attackerId,
            targetId,
            workDate: day,
            expiresAt: new Date(Date.now() + ATTACK_RULES.blockSeconds * 1000),
          },
          { transaction: t }
        );
      })
    );

    const attacker = await User.findByPk(attackerId, { attributes: ['id', 'name'] });
    notify(targetId, `${attacker?.name ?? attackerId}님이 퇴근 공격권을 사용했습니다!`, created.id);

    return { id: created.id, targetId, expiresAt: created.expiresAt };
  },

  /** 방어권을 사서 지금 걸린 공격을 푼다 */
  async defend(userId: string, attackId: number) {
    await ensureBalanceRow(userId);

    const defended = await withLockRetry(() =>
      sequelize.transaction(async t => {
        const row = await AttendanceAttack.findByPk(attackId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!row) throw new AppError(404, '공격을 찾을 수 없습니다.');
        if (row.targetId !== userId) throw new AppError(403, '나에게 걸린 공격이 아닙니다.');
        // 잠근 뒤 다시 확인한다 — 두 창에서 동시에 누르면 두 번 값을 치를 수 있다
        if (row.defendedAt) throw new AppError(409, '이미 방어했습니다.');
        if (row.expiresAt.getTime() <= Date.now()) {
          throw new AppError(409, '이미 풀린 공격입니다.');
        }

        const balance = await lockBalance(userId, t);
        if (balance.balance < ATTACK_RULES.defendCost) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. 방어권은 ${ATTACK_RULES.defendCost.toLocaleString()}P 입니다 (보유 ${balance.balance.toLocaleString()}P).`
          );
        }
        await apply(balance, -ATTACK_RULES.defendCost, 'defend_cost', '퇴근 방어권', t);

        row.defendedAt = new Date();
        await row.save({ transaction: t });
        return row;
      })
    );

    const me = await User.findByPk(userId, { attributes: ['id', 'name'] });
    notify(defended.attackerId, `${me?.name ?? userId}님이 방어권을 사용했습니다.`, defended.id);

    return { id: defended.id };
  },
};
