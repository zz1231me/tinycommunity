// server/src/services/duel.service.ts
// 포인트를 걸고 하는 가위바위보 한 판.
//
// 지켜야 하는 것 셋:
//
//  1) 건 포인트는 신청하는 순간 맡긴다(에스크로).
//     결과가 날 때 받으려 하면, 그 사이에 그 포인트를 써 버린 사람에게서는
//     받아낼 수 없다 — 이미 진 판의 빚만 남는다.
//
//  2) 신청자의 손은 승부가 나기 전까지 상대에게 내려보내지 않는다.
//     보이면 이기는 손을 내면 그만이라 대결이 아니게 된다. 가리는 곳은 view() 하나뿐이다.
//
//  3) 잔액은 언제나 원장의 합과 같다.
//     맡기고·돌려주고·지급하는 모든 움직임이 point.service 의 apply 를 지나가므로,
//     원장에 줄을 남기지 않고 잔액만 바뀌는 경로가 없다.

import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/sequelize';
import PointDuelModel, { PointDuel, type DuelHand } from '../models/PointDuel';
import UserPointModel from '../models/UserPoint';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { apply, ensureBalanceRow, lockBalance, withLockRetry } from './point.service';
import { DUEL_RULES, judge } from '../config/duel';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

const EXPIRE_MS = DUEL_RULES.expireMinutes * 60_000;

/** 목록에 이름을 함께 보여 주려면 양쪽 사람을 조인해야 한다 */
const withUsers = [
  { model: User, as: 'challenger', attributes: ['id', 'name'] },
  { model: User, as: 'opponent', attributes: ['id', 'name'] },
];

function nameOf(duel: PointDuelModel, side: 'challenger' | 'opponent'): string {
  const joined = duel as unknown as Record<string, { name?: string } | undefined>;
  return joined[side]?.name ?? (side === 'challenger' ? duel.challengerId : duel.opponentId);
}

/**
 * 한 판을 보는 사람에 맞춰 옮긴다.
 *
 * 손을 가리는 판단은 여기 한 곳에만 있다. 컨트롤러나 화면에서 각자 가리게 두면
 * 새로 만든 목록 하나에서 빠뜨리는 것으로 끝난다 — 그 한 곳이 곧 구멍이다.
 */
function view(duel: PointDuelModel, viewerId: string) {
  const settled = duel.status !== 'waiting';
  const iAmChallenger = duel.challengerId === viewerId;
  return {
    id: duel.id,
    stake: duel.stake,
    status: duel.status,
    result: duel.result,
    challengerId: duel.challengerId,
    challengerName: nameOf(duel, 'challenger'),
    opponentId: duel.opponentId,
    opponentName: nameOf(duel, 'opponent'),
    // 아직 기다리는 판이면 신청자 본인에게만 보인다
    challengerHand: settled || iAmChallenger ? duel.challengerHand : null,
    opponentHand: settled ? duel.opponentHand : null,
    expiresAt: duel.expiresAt,
    settledAt: duel.settledAt,
    createdAt: duel.createdAt,
  };
}

export type DuelView = ReturnType<typeof view>;

/**
 * 두 사람의 잔액을 늘 같은 차례로 잠근다.
 *
 * A→B 와 B→A 두 판이 동시에 정산되면, 서로 상대가 쥔 잠금을 기다리며 멈춘다(교착).
 * 아이디 순으로 고정하면 그런 짝이 아예 생기지 않는다.
 */
async function lockBoth(
  a: string,
  b: string,
  t: Transaction
): Promise<Record<string, UserPointModel>> {
  const [first, second] = a < b ? [a, b] : [b, a];
  const firstRow = await lockBalance(first, t);
  const secondRow = await lockBalance(second, t);
  return { [first]: firstRow, [second]: secondRow };
}

/**
 * 아직 기다리는 판을 닫고 신청자에게 돌려준다. 거절·취소·시간 초과가 모두 이리로 온다.
 *
 * 잠근 뒤에 다시 status 를 확인한다 — 거절과 시간 초과가 같은 순간에 들어오면
 * 확인을 밖에서만 한 경우 두 번 돌려주게 된다.
 *
 * 이미 닫혀 있었으면 false 를 돌려준다(아무것도 하지 않음).
 */
async function closeWithRefund(duelId: number, memo: string): Promise<boolean> {
  return withLockRetry(() =>
    sequelize.transaction(async t => {
      const duel = await PointDuel.findByPk(duelId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!duel || duel.status !== 'waiting') return false;

      const row = await lockBalance(duel.challengerId, t);
      await apply(row, duel.stake, 'duel_refund', memo, t);

      duel.status = 'canceled';
      duel.settledAt = new Date();
      await duel.save({ transaction: t });
      return true;
    })
  );
}

/**
 * 시간이 지난 판을 걷어 낸다.
 *
 * 따로 도는 일꾼(크론)을 두지 않고, 이 사람이 화면을 열거나 새로 신청할 때 그 사람이
 * 걸린 판만 정리한다. 맡긴 포인트가 영영 묶이지 않으려면 어딘가에서는 반드시
 * 닫아야 하는데, 정작 그 포인트가 아쉬운 사람이 곧 화면을 열기 때문이다.
 */
async function sweepExpired(userId: string): Promise<void> {
  const stale = await PointDuel.findAll({
    where: {
      status: 'waiting',
      expiresAt: { [Op.lt]: new Date() },
      [Op.or]: [{ challengerId: userId }, { opponentId: userId }],
    },
    attributes: ['id'],
    // 한 번에 몰아서 정리하다 화면 열기가 느려지지 않게 상한을 둔다. 남은 것은 다음 번에.
    limit: 20,
  });

  for (const row of stale) {
    try {
      await closeWithRefund(row.id, '대결 시간 초과 환불');
    } catch (err) {
      // 정리에 실패해도 화면은 열려야 한다. 다음에 다시 시도된다.
      logError('만료된 대결 환불 실패', err, { duelId: row.id, userId });
    }
  }
}

/** 알림은 판의 정산과 묶지 않는다 — 알림이 실패해도 포인트는 이미 옳게 움직였다 */
function notify(userId: string, message: string, duelId: number): void {
  void notificationService
    .create({
      userId,
      type: 'DUEL',
      message,
      link: '/profile?tab=points',
      relatedId: String(duelId),
    })
    .catch(err => logError('대결 알림 생성 실패', err, { userId, duelId }));
}

async function findOrFail(duelId: number): Promise<PointDuelModel> {
  const duel = await PointDuel.findByPk(duelId, { include: withUsers });
  if (!duel) throw new AppError(404, '대결을 찾을 수 없습니다.');
  return duel;
}

export const duelService = {
  /** 화면에 필요한 현재 상태 */
  async status(userId: string) {
    await sweepExpired(userId);

    const [balanceRow, incoming, outgoing, recent] = await Promise.all([
      UserPointModel.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      PointDuel.findAll({
        where: { opponentId: userId, status: 'waiting' },
        include: withUsers,
        order: [['id', 'DESC']],
        limit: DUEL_RULES.maxOpenPerUser * 5,
      }),
      PointDuel.findAll({
        where: { challengerId: userId, status: 'waiting' },
        include: withUsers,
        order: [['id', 'DESC']],
        limit: DUEL_RULES.maxOpenPerUser,
      }),
      PointDuel.findAll({
        where: {
          status: { [Op.ne]: 'waiting' },
          [Op.or]: [{ challengerId: userId }, { opponentId: userId }],
        },
        include: withUsers,
        order: [['id', 'DESC']],
        limit: 10,
      }),
    ]);

    return {
      balance: balanceRow?.balance ?? 0,
      rules: {
        minStake: DUEL_RULES.minStake,
        maxStake: DUEL_RULES.maxStake,
        expireMinutes: DUEL_RULES.expireMinutes,
        maxOpenPerUser: DUEL_RULES.maxOpenPerUser,
      },
      incoming: incoming.map(d => view(d, userId)),
      outgoing: outgoing.map(d => view(d, userId)),
      recent: recent.map(d => view(d, userId)),
    };
  },

  /**
   * 대결을 신청한다. 거는 포인트는 이 자리에서 바로 빠진다.
   *
   * 한도 확인과 차감을 같은 잠금 안에서 한다 — 밖에서만 확인하면 빠르게 여러 번 눌렀을 때
   * 잔액보다 많이 걸 수 있다.
   */
  async create(
    challengerId: string,
    input: { opponentId: string; stake: number; hand: DuelHand }
  ): Promise<DuelView> {
    const { opponentId, stake, hand } = input;

    if (opponentId === challengerId) {
      throw new AppError(400, '자기 자신에게는 대결을 신청할 수 없습니다.');
    }
    // 스키마에서도 막지만 서비스에서도 확인한다 — 이 서비스를 다른 데서 부를 수 있다
    if (!Number.isInteger(stake) || stake < DUEL_RULES.minStake || stake > DUEL_RULES.maxStake) {
      throw new AppError(
        400,
        `걸 수 있는 포인트는 ${DUEL_RULES.minStake.toLocaleString()}~${DUEL_RULES.maxStake.toLocaleString()}P 입니다.`
      );
    }

    const opponent = await User.findByPk(opponentId, {
      attributes: ['id', 'name', 'isActive', 'isDeleted'],
    });
    if (!opponent || !opponent.isActive || opponent.isDeleted) {
      throw new AppError(404, '상대를 찾을 수 없습니다.');
    }

    await sweepExpired(challengerId);
    await ensureBalanceRow(challengerId);

    const created = await withLockRetry(() =>
      sequelize.transaction(async t => {
        const open = await PointDuel.count({
          where: { challengerId, status: 'waiting' },
          transaction: t,
        });
        if (open >= DUEL_RULES.maxOpenPerUser) {
          throw new AppError(
            429,
            `동시에 걸어 둘 수 있는 대결은 ${DUEL_RULES.maxOpenPerUser}판까지입니다.`
          );
        }

        const duplicate = await PointDuel.count({
          where: { challengerId, opponentId, status: 'waiting' },
          transaction: t,
        });
        if (duplicate > 0) {
          throw new AppError(409, '이 사람에게 신청한 대결이 아직 남아 있습니다.');
        }

        const row = await lockBalance(challengerId, t);
        if (row.balance < stake) {
          throw new AppError(400, `포인트가 모자랍니다 (보유 ${row.balance.toLocaleString()}P).`);
        }
        await apply(row, -stake, 'duel_stake', `대결 신청 ${stake}p`, t);

        return PointDuel.create(
          {
            challengerId,
            opponentId,
            stake,
            challengerHand: hand,
            expiresAt: new Date(Date.now() + EXPIRE_MS),
          },
          { transaction: t }
        );
      })
    );

    notify(
      opponentId,
      `${challengerId}님이 ${stake.toLocaleString()}P 를 걸고 대결을 신청했습니다.`,
      created.id
    );

    return view(await findOrFail(created.id), challengerId);
  },

  /**
   * 받아서 손을 낸다 — 이 한 번의 트랜잭션에서 승부와 정산이 함께 끝난다.
   *
   * 판을 먼저 잠그므로, 두 창에서 동시에 눌러도 한 번만 정산된다.
   */
  async accept(opponentId: string, duelId: number, hand: DuelHand): Promise<DuelView> {
    await ensureBalanceRow(opponentId);

    const settled = await withLockRetry(() =>
      sequelize.transaction(async t => {
        const duel = await PointDuel.findByPk(duelId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!duel) throw new AppError(404, '대결을 찾을 수 없습니다.');
        if (duel.opponentId !== opponentId) throw new AppError(403, '나에게 온 대결이 아닙니다.');
        if (duel.status !== 'waiting') throw new AppError(409, '이미 끝난 대결입니다.');
        if (duel.expiresAt.getTime() <= Date.now()) {
          throw new AppError(410, '시간이 지난 대결입니다. 건 포인트는 곧 돌려드립니다.');
        }

        const rows = await lockBoth(duel.challengerId, opponentId, t);
        const mine = rows[opponentId];
        if (mine.balance < duel.stake) {
          throw new AppError(
            400,
            `포인트가 모자랍니다. 이 대결은 ${duel.stake.toLocaleString()}P 가 필요합니다 (보유 ${mine.balance.toLocaleString()}P).`
          );
        }
        await apply(mine, -duel.stake, 'duel_stake', `대결 응수 ${duel.stake}p`, t);

        const verdict = judge(duel.challengerHand, hand);
        if (verdict === 'draw') {
          await apply(rows[duel.challengerId], duel.stake, 'duel_refund', '대결 무승부 환불', t);
          await apply(mine, duel.stake, 'duel_refund', '대결 무승부 환불', t);
        } else {
          const winnerId = verdict === 'challenger' ? duel.challengerId : opponentId;
          const prize = duel.stake * 2;
          await apply(rows[winnerId], prize, 'duel_win', `대결 승리 ${prize}p`, t);
        }

        duel.opponentHand = hand;
        duel.status = 'done';
        duel.result = verdict;
        duel.settledAt = new Date();
        await duel.save({ transaction: t });
        return duel;
      })
    );

    const toChallenger =
      settled.result === 'draw'
        ? `${opponentId}님과의 대결은 비겼습니다. 건 포인트를 돌려받았습니다.`
        : settled.result === 'challenger'
          ? `${opponentId}님과의 대결에서 이겼습니다! ${(settled.stake * 2).toLocaleString()}P 획득`
          : `${opponentId}님과의 대결에서 졌습니다.`;
    notify(settled.challengerId, toChallenger, settled.id);

    return view(await findOrFail(settled.id), opponentId);
  },

  /** 받은 사람이 거절한다 — 신청자가 건 포인트를 돌려받는다 */
  async decline(opponentId: string, duelId: number): Promise<void> {
    const duel = await findOrFail(duelId);
    if (duel.opponentId !== opponentId) throw new AppError(403, '나에게 온 대결이 아닙니다.');
    if (duel.status !== 'waiting') throw new AppError(409, '이미 끝난 대결입니다.');

    await closeWithRefund(duelId, '대결 거절 환불');
    notify(duel.challengerId, `${opponentId}님이 대결을 거절했습니다.`, duelId);
  },

  /** 신청한 사람이 거둬들인다 */
  async cancel(challengerId: string, duelId: number): Promise<void> {
    const duel = await findOrFail(duelId);
    if (duel.challengerId !== challengerId) throw new AppError(403, '내가 신청한 대결이 아닙니다.');
    if (duel.status !== 'waiting') throw new AppError(409, '이미 끝난 대결입니다.');

    await closeWithRefund(duelId, '대결 취소 환불');
  },
};
