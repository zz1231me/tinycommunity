// server/src/services/attendanceAttack.service.ts
// 퇴근 공격권·방어권.
//
// ⚠️ 가장 중요한 성질부터: 이 서비스는 출퇴근 '기록' 을 건드리지 않는다.
//
// attendance.service 의 checkOut 은 이 표를 보지 않는다. 공격을 받는 중에 퇴근을
// 눌러도 그 순간이 그대로 기록된다. 버튼은 잠기지도 않는다 — 도망다니고 깜빡일 뿐,
// 끝내 누르면 눌린다. (테스트 '기록은 건드리지 않는다' 가 이 성질을 붙잡고 있다.)
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
import {
  apply,
  ensureBalanceRow,
  lockBalance,
  lockBothBalances,
  today,
  withLockRetry,
} from './point.service';
import { isAttackKind, type AttackKind } from '../config/attendanceAttack';
import { getAttackSettings } from '../utils/settingsCache';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

const withAttacker = { model: User, as: 'attacker', attributes: ['id', 'name'] };

function nameOf(row: AttendanceAttackModel): string {
  const joined = row as unknown as { attacker?: { name?: string } };
  return joined.attacker?.name ?? row.attackerId;
}

/**
 * 지금 이 사람에게 걸려 있는 살아 있는 공격.
 *
 * 종류를 가리지 않는다 — 방해든 숨기기든 한 번에 하나만 걸린다. 종류별로 따로 두면
 * 둘이 겹쳐 걸려, 받는 쪽은 방어권을 두 번 사야 한다.
 */
async function liveAttackAgainst(targetId: string): Promise<AttendanceAttackModel | null> {
  return AttendanceAttack.findOne({
    where: {
      targetId,
      defendedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    include: [withAttacker],
    order: [['id', 'DESC']],
  });
}

/**
 * 지금 근무 중인가 — 퇴근을 앞둔 사람에게만 의미가 있는 장난이다.
 *
 * 근무일을 오늘·어제로 묶는다. 퇴근을 한 번 깜빡하면 그 기록은 영영 닫히지 않는다
 * (checkOut 은 오늘 것이거나 자정을 넘긴 어제 것만 닫는다). 날짜를 묶지 않으면
 * 그 사람은 그날 이후로 새벽이든 주말이든 24시간 내내 공격 대상이 된다.
 */
async function isWorking(userId: string): Promise<boolean> {
  const open = await AttendanceRecord.findOne({
    where: {
      UserId: userId,
      checkOutAt: null,
      workDate: { [Op.gte]: today(new Date(Date.now() - 86_400_000)) },
    },
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

export const attendanceAttackService = {
  /** 출근 화면이 물어보는 것 — 나에게 걸린 공격과 내가 남은 횟수 */
  async state(userId: string) {
    const rules = getAttackSettings();
    const [live, balanceRow, usedToday] = await Promise.all([
      liveAttackAgainst(userId),
      UserPoint.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      AttendanceAttack.count({ where: { attackerId: userId, workDate: today() } }),
    ]);

    return {
      rules: {
        cost: rules.cost,
        hideCost: rules.hideCost,
        defendCost: rules.defendCost,
        blockSeconds: rules.blockSeconds,
        hideSeconds: rules.hideSeconds,
        dailyLimit: rules.dailyLimitPerAttacker,
      },
      balance: balanceRow?.balance ?? 0,
      /**
       * 나에게 걸린 공격 (없으면 null).
       *
       * kind 를 함께 준다 — 받는 화면이 버튼을 흔들지, 잠깐 감출지를 이것으로 가른다.
       */
      incoming: live
        ? {
            id: live.id,
            attackerId: live.attackerId,
            attackerName: nameOf(live),
            kind: live.kind,
            expiresAt: live.expiresAt,
          }
        : null,
      usedToday,
      remainingToday: Math.max(0, rules.dailyLimitPerAttacker - usedToday),
    };
  },

  /** 공격권을 사서 바로 쓴다 */
  async attack(attackerId: string, input: { targetId: string; kind?: string }) {
    const rules = getAttackSettings();
    const targetId = input.targetId;
    const kind: AttackKind = isAttackKind(input.kind) ? input.kind : 'chaos';

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
    // 대상의 잔액 행도 미리 만들어 둔다. 대상의 포인트를 건드리지는 않지만 아래에서
    // 그 행을 잠금 지점으로 쓴다 — 행이 없으면 lockBalance 가 500 을 던진다.
    await ensureBalanceRow(attackerId);
    await ensureBalanceRow(targetId);
    const cost = kind === 'hide' ? rules.hideCost : rules.cost;

    const created = await withLockRetry(() =>
      sequelize.transaction(async t => {
        const day = today();

        // 무엇이든 세기 전에 두 사람을 먼저 잠근다 — 공격자와 대상 둘 다.
        //
        // 아래 두 번의 count 는 그 자체로는 아무도 막지 못한다. 트랜잭션 안에 두는
        // 것만으로 부족하다: 같은 순간의 다른 트랜잭션도 똑같이 0 을 읽는다.
        // 실제로 줄을 세우는 것은 잠금뿐이다.
        //   - 공격자 쪽 잠금: 하루 한도가 넘치는 것을 막는다.
        //   - 대상 쪽 잠금: 서로 다른 두 공격자가 한 사람에게 동시에 거는 것을 막는다.
        //     이것이 없어서, 먼저 건 사람이 값을 치르고도 state() 에는 나중 것만
        //     보이는 일이 생길 수 있었다(state 는 가장 최근 하나만 준다).
        // 아이디 순으로 고정하므로 A↔B 가 서로 맞물려 멈추는 짝은 생기지 않는다.
        const rows = await lockBothBalances(attackerId, targetId, t);

        const used = await AttendanceAttack.count({
          where: { attackerId, workDate: day },
          transaction: t,
        });
        if (used >= rules.dailyLimitPerAttacker) {
          throw new AppError(429, `오늘은 ${rules.dailyLimitPerAttacker}번을 모두 사용했습니다.`);
        }

        // 공격은 종류를 가리지 않고 겹쳐 걸 수 없다. 겹치면 받는 쪽은 하나를 풀어도
        // 곧바로 다음 것이 떠서 방어권 값을 두 번 내게 된다.
        const already = await AttendanceAttack.count({
          where: {
            targetId,
            defendedAt: null,
            expiresAt: { [Op.gt]: new Date() },
          },
          transaction: t,
        });
        if (already > 0) throw new AppError(409, '이미 방해받고 있는 사람입니다.');

        const row = rows[attackerId];
        if (row.balance < cost) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. ${cost.toLocaleString()}P 가 필요합니다 (보유 ${row.balance.toLocaleString()}P).`
          );
        }
        await apply(
          row,
          -cost,
          'attack_cost',
          kind === 'hide' ? '퇴근 버튼 숨기기' : '퇴근 방해',
          t
        );

        // 숨기기는 그동안 정말로 누를 수 없으므로 훨씬 짧다(기본 10초).
        const lifeMs = (kind === 'hide' ? rules.hideSeconds : rules.blockSeconds) * 1000;

        return AttendanceAttack.create(
          {
            attackerId,
            targetId,
            workDate: day,
            kind,
            expiresAt: new Date(Date.now() + lifeMs),
          },
          { transaction: t }
        );
      })
    );

    const attacker = await User.findByPk(attackerId, { attributes: ['id', 'name'] });
    const who = attacker?.name ?? attackerId;
    notify(
      targetId,
      kind === 'hide'
        ? `${who}님이 퇴근 버튼을 잠깐 숨겼습니다!`
        : `${who}님이 퇴근 방해를 걸었습니다!`,
      created.id
    );

    return { id: created.id, targetId, kind, expiresAt: created.expiresAt };
  },

  /** 방어권을 사서 지금 걸린 방해를 푼다 */
  async defend(userId: string, attackId: number) {
    const rules = getAttackSettings();
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
        if (balance.balance < rules.defendCost) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. 방어권은 ${rules.defendCost.toLocaleString()}P 입니다 (보유 ${balance.balance.toLocaleString()}P).`
          );
        }
        await apply(balance, -rules.defendCost, 'defend_cost', '퇴근 방어권', t);

        // 값을 한 번 치렀으면 나에게 걸린 살아 있는 공격을 종류와 관계없이 전부 푼다.
        // 어떤 이유로든 둘 이상 남아 있을 때 하나씩 돈을 내게 하지 않는다.
        await AttendanceAttack.update(
          { defendedAt: new Date() },
          {
            where: {
              targetId: userId,
              defendedAt: null,
              expiresAt: { [Op.gt]: new Date() },
            },
            transaction: t,
          }
        );
        return row;
      })
    );

    const me = await User.findByPk(userId, { attributes: ['id', 'name'] });
    notify(defended.attackerId, `${me?.name ?? userId}님이 방어권을 사용했습니다.`, defended.id);

    return { id: defended.id };
  },
};
