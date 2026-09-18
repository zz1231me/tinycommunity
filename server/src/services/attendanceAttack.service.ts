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
import { ATTACK_MAX_STACK, isAttackKind, type AttackKind } from '../config/attendanceAttack';
import { getAttackSettings } from '../utils/settingsCache';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

const withAttacker = { model: User, as: 'attacker', attributes: ['id', 'name'] };

function nameOf(row: AttendanceAttackModel): string {
  const joined = row as unknown as { attacker?: { name?: string } };
  return joined.attacker?.name ?? row.attackerId;
}

/** 이 공격이 시작되는(된) 시각 — startsAt 칸이 생기기 전의 행은 만든 시각이 시작이다 */
function startOf(row: AttendanceAttackModel): number {
  return (row.startsAt ?? row.createdAt).getTime();
}

/**
 * 이 사람에게 걸려 있는 살아 있는 공격들 — 차례대로. 맨 앞이 지금 걸려 있는 것이다.
 *
 * 공격은 줄을 선다. 새 공격은 줄 맨 끝 공격이 끝나야 시작하고, 방어권은 맨 앞 하나를 푼다.
 * 줄은 길어야 ATTACK_MAX_STACK 개라 정렬은 여기서 한다(startsAt 이 빈 옛 행 때문이기도 하다).
 */
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

/**
 * 지금 근무 중인가 — 퇴근을 앞둔 사람에게만 의미가 있는 장난이다.
 *
 * 근무일을 오늘·어제로 묶는다. 퇴근을 한 번 깜빡하면 그 기록은 영영 닫히지 않는다
 * (checkOut 은 오늘 것이거나 자정을 넘긴 어제 것만 닫는다). 날짜를 묶지 않으면
 * 그 사람은 그날 이후로 새벽이든 주말이든 24시간 내내 공격 대상이 된다.
 */
async function isWorking(userId: string): Promise<boolean> {
  // 퇴근 버튼이 닫을 기록과 같은 기록을 본다(attendance.service 의 checkOut): 오늘 것이
  // 있으면 그것, 없을 때만 자정을 넘긴 어제의 안 닫힌 것.
  //
  // '오늘·어제 중 안 닫힌 것이 하나라도 있으면' 으로 보면, 어제 퇴근을 깜빡한 사람은 오늘
  // 출근하고 퇴근까지 한 뒤에도 하루 종일 공격 대상이 된다 — 오늘 기록이 있으면 퇴근은
  // 어제 것을 닫지 않으므로 그 기록은 끝내 열린 채로 남는다.
  const todays = await AttendanceRecord.findOne({
    where: { UserId: userId, workDate: today() },
    attributes: ['id', 'checkOutAt'],
  });
  if (todays) return todays.checkOutAt === null;

  const carried = await AttendanceRecord.findOne({
    where: {
      UserId: userId,
      checkOutAt: null,
      workDate: today(new Date(Date.now() - 86_400_000)),
    },
    attributes: ['id'],
  });
  return carried !== null;
}

/** 알림은 포인트 정산과 묶지 않는다 — 알림이 실패해도 포인트는 이미 옳게 움직였다 */
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
  /** 출근 화면이 물어보는 것 — 나에게 걸린 공격과 내가 남은 횟수 */
  async state(userId: string) {
    const rules = getAttackSettings();
    const [queue, balanceRow, usedToday] = await Promise.all([
      liveQueue(userId),
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
        maxStack: ATTACK_MAX_STACK,
      },
      balance: balanceRow?.balance ?? 0,
      /**
       * 지금 나에게 걸려 있는 공격 — 줄의 맨 앞 (없으면 null).
       *
       * kind 를 함께 준다 — 받는 화면이 버튼을 흔들지, 잠깐 감출지를 이것으로 가른다.
       */
      incoming: queue[0] ? queueView(queue[0]) : null,
      /** 쌓여 있는 공격 전부, 차례대로. 길이가 곧 퇴근 버튼이 얼마나 사나운지다. */
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
    // 이제부터는 입력이 아니라 DB 가 돌려준 아이디를 쓴다. 대소문자를 가리지 않는 DB(MariaDB
    // 기본값)에서는 'ALICE' 로 찾아도 alice 가 나오는데, 입력값을 그대로 저장하면 alice 가
    // 방어하려 할 때 '나에게 걸린 공격이 아닙니다' 로 막힌다. 자기 자신 확인도 여기서 다시 한다.
    const targetId = target.id;
    if (attackerId === targetId) {
      throw new AppError(400, '자기 자신에게는 쓸 수 없습니다.');
    }
    if (!(await isWorking(targetId))) {
      throw new AppError(400, '지금 근무 중인 사람에게만 쓸 수 있습니다.');
    }
    // 대상의 잔액 행도 미리 만들어 둔다. 대상의 포인트를 건드리지는 않지만 아래에서
    // 그 행을 잠금 지점으로 쓴다 — 행이 없으면 lockBalance 가 500 을 던진다.
    await ensureBalanceRow(attackerId);
    await ensureBalanceRow(targetId);
    const cost = kind === 'hide' ? rules.hideCost : rules.cost;

    const result = await withLockRetry(() =>
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

        // 공격은 쌓인다 — 줄을 서서 차례로 걸리고, 상한을 넘으면 받지 않는다.
        // 대상의 잔액 행을 위에서 잠갔으므로 두 공격자가 같은 순간에 걸어도 줄이 꼬이지 않는다.
        const queue = await liveQueue(targetId, t);
        if (queue.length >= ATTACK_MAX_STACK) {
          throw new AppError(409, `이미 공격이 ${ATTACK_MAX_STACK}개 쌓여 있습니다.`);
        }

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

        // 숨기기는 그동안 정말로 누를 수 없으므로 훨씬 짧다.
        const lifeMs = (kind === 'hide' ? rules.hideSeconds : rules.blockSeconds) * 1000;
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
      (kind === 'hide'
        ? `${who}님이 퇴근 버튼을 잠깐 숨겼습니다!`
        : `${who}님이 퇴근 방해를 걸었습니다!`) + (stack > 1 ? ` (쌓인 공격 ${stack}개)` : ''),
      created.id,
      // 공격받은 자리(출근 화면)로 — 퇴근 버튼 효과와 방어권이 거기 있다
      '/attendance'
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

  /**
   * 방어권 한 장으로 맨 앞의 공격 하나를 푼다. 뒤에 쌓인 공격은 곧바로 앞으로 당겨진다.
   */
  async defend(userId: string, attackId: number) {
    const rules = getAttackSettings();
    await ensureBalanceRow(userId);

    const defended = await withLockRetry(() =>
      sequelize.transaction(async t => {
        // 잔액 행을 먼저 잠근다 — 공격(attack)과 같은 차례다. 아래에서 줄의 다른 행들을
        // 고치므로, 순서가 엇갈리면 공격과 방어가 서로의 잠금을 기다리며 멈출 수 있다.
        const balance = await lockBalance(userId, t);

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

        // 맨 앞부터 푼다. 뒤의 것을 먼저 풀어 봐야 지금 걸린 공격은 그대로라 값만 나간다.
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

        // 뒤에 쌓인 공격을 지금부터 다시 이어 붙인다 — 각자 길이는 그대로.
        // 그대로 두면 앞 공격이 원래 끝났을 시각까지 아무 공격도 없는 빈 틈이 생긴다.
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
    // 공격한 사람에게는 출근 화면이 아니라 공격권이 있는 포인트 탭이 맞다.
    // 그 사람의 출근 화면에는 자기가 건 공격에 대한 것이 아무것도 없다.
    notify(
      defended.row.attackerId,
      `${me?.name ?? userId}님이 방어권을 사용했습니다.`,
      defended.row.id,
      '/profile?tab=points'
    );

    return { id: defended.row.id, remaining: defended.remaining };
  },
};
