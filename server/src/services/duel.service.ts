// 포인트 대결. 스테이크는 신청 시점에 차감하고, 잔액 변동은 모두 point.service 의 apply 를 거친다.

import { Op } from 'sequelize';
import { sequelize } from '../config/sequelize';
import PointDuelModel, { PointDuel, type DuelHand } from '../models/PointDuel';
import UserPointModel from '../models/UserPoint';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import {
  apply,
  ensureBalanceRow,
  lockBalance,
  lockBothBalances,
  withLockRetry,
} from './point.service';
import { DUEL_MESSAGE_MAX, DUEL_TAUNT_MAX, cleanLine, isDuelHand, judge } from '../config/duel';
import { getDuelSettings } from '../utils/settingsCache';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

const withUsers = [
  { model: User, as: 'challenger', attributes: ['id', 'name'] },
  { model: User, as: 'opponent', attributes: ['id', 'name'] },
];

function nameOf(duel: PointDuelModel, side: 'challenger' | 'opponent'): string {
  const joined = duel as unknown as Record<string, { name?: string } | undefined>;
  return joined[side]?.name ?? (side === 'challenger' ? duel.challengerId : duel.opponentId);
}

/** 보는 사람 기준으로 판을 변환한다. 손을 가리는 판단은 이 함수에만 둔다. */
function view(duel: PointDuelModel, viewerId: string) {
  // 손 공개는 status === 'done' 일 때만. 거절·취소·만료 판에서 공개하면 손이 새어 나간다.
  const revealed = duel.status === 'done';
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
    challengerHand: revealed || iAmChallenger ? duel.challengerHand : null,
    opponentHand: revealed ? duel.opponentHand : null,
    expiresAt: duel.expiresAt,
    settledAt: duel.settledAt,
    createdAt: duel.createdAt,
    message: duel.message ?? null,
    taunt: duel.taunt ?? null,
  };
}

export type DuelView = ReturnType<typeof view>;

/** 대기 중인 판을 닫고 환불한다. 잠근 뒤 status 를 다시 확인해 이중 환불을 막는다. 이미 닫혀 있었으면 false. */
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

/** 이 사용자가 걸린 만료 판만 정리한다. */
async function sweepExpired(userId: string): Promise<void> {
  const stale = await PointDuel.findAll({
    where: {
      status: 'waiting',
      expiresAt: { [Op.lt]: new Date() },
      [Op.or]: [{ challengerId: userId }, { opponentId: userId }],
    },
    attributes: ['id'],
    // 한 번에 정리하는 수를 제한한다. 남은 것은 다음 호출에서.
    limit: 20,
  });

  for (const row of stale) {
    try {
      await closeWithRefund(row.id, '대결 시간 초과 환불');
    } catch (err) {
      // 정리에 실패해도 조회는 계속한다.
      logError('만료된 대결 환불 실패', err, { duelId: row.id, userId });
    }
  }
}

/** 만료 판을 사용자 구분 없이 정리한다. 서버가 주기적으로 호출하며, limit 로 한 주기 부하를 제한한다. */
export async function sweepAllExpiredDuels(limit = 200): Promise<number> {
  const stale = await PointDuel.findAll({
    where: { status: 'waiting', expiresAt: { [Op.lt]: new Date() } },
    attributes: ['id'],
    limit,
  });

  let closed = 0;
  for (const row of stale) {
    try {
      if (await closeWithRefund(row.id, '대결 시간 초과 환불')) closed++;
    } catch (err) {
      logError('만료된 대결 환불 실패', err, { duelId: row.id });
    }
  }
  return closed;
}

/** 알림은 정산 트랜잭션과 분리한다. 실패해도 포인트 처리에는 영향이 없다. */
function notify(userId: string, message: string, duelId: number): void {
  void notificationService
    .create({
      userId,
      type: 'DUEL',
      message,
      link: `/profile?tab=points&duel=${duelId}`,
      relatedId: String(duelId),
    })
    .catch(err => logError('대결 알림 생성 실패', err, { userId, duelId }));
}

async function displayName(userId: string): Promise<string> {
  const user = await User.findByPk(userId, { attributes: ['id', 'name'] });
  return user?.name ?? userId;
}

async function findOrFail(duelId: number): Promise<PointDuelModel> {
  const duel = await PointDuel.findByPk(duelId, { include: withUsers });
  if (!duel) throw new AppError(404, '대결을 찾을 수 없습니다.');
  return duel;
}

export const duelService = {
  async status(userId: string) {
    await sweepExpired(userId);
    const rules = getDuelSettings();

    const [balanceRow, incoming, outgoing, recent] = await Promise.all([
      UserPointModel.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      PointDuel.findAll({
        where: { opponentId: userId, status: 'waiting' },
        include: withUsers,
        order: [['id', 'DESC']],
        // 설정값(maxOpenPerUser)으로 자르면 받은 판이 잘려 응답할 수 없다.
        limit: 50,
      }),
      PointDuel.findAll({
        where: { challengerId: userId, status: 'waiting' },
        include: withUsers,
        order: [['id', 'DESC']],
        // 같은 이유로 설정값으로 자르지 않는다. 줄이면 이미 건 판이 목록에서 사라져 취소할 수 없다.
        limit: 50,
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
        minStake: rules.minStake,
        maxStake: rules.maxStake,
        expireMinutes: rules.expireMinutes,
        maxOpenPerUser: rules.maxOpenPerUser,
      },
      incoming: incoming.map(d => view(d, userId)),
      outgoing: outgoing.map(d => view(d, userId)),
      recent: recent.map(d => view(d, userId)),
    };
  },

  /** 대결 신청. 한도 확인과 차감을 같은 잠금 안에서 처리한다. */
  async create(
    challengerId: string,
    input: { opponentId: string; stake: number; hand: DuelHand; message?: string }
  ): Promise<DuelView> {
    const { stake, hand } = input;
    const message = cleanLine(input.message, DUEL_MESSAGE_MAX);
    const rules = getDuelSettings();

    if (input.opponentId === challengerId) {
      throw new AppError(400, '자기 자신에게는 대결을 신청할 수 없습니다.');
    }
    // 이 서비스는 라우트 밖에서도 호출되므로 여기서도 검증한다.
    if (!Number.isInteger(stake) || stake < rules.minStake || stake > rules.maxStake) {
      throw new AppError(
        400,
        `걸 수 있는 포인트는 ${rules.minStake.toLocaleString()}~${rules.maxStake.toLocaleString()}P 입니다.`
      );
    }

    const opponent = await User.findByPk(input.opponentId, {
      attributes: ['id', 'name', 'isActive', 'isDeleted'],
    });
    if (!opponent || !opponent.isActive || opponent.isDeleted) {
      throw new AppError(404, '상대를 찾을 수 없습니다.');
    }
    // DB 가 돌려준 아이디를 쓴다. 대소문자가 다른 입력값을 저장하면 상대가 받지도 거절하지도 못한다.
    const opponentId = opponent.id;
    if (opponentId === challengerId) {
      throw new AppError(400, '자기 자신에게는 대결을 신청할 수 없습니다.');
    }

    await sweepExpired(challengerId);
    await ensureBalanceRow(challengerId);

    const created = await withLockRetry(() =>
      sequelize.transaction(async t => {
        // 세기 전에 잔액 행을 먼저 잠근다. 잠그지 않으면 동시 요청이 같은 open 값을 읽어 상한을 넘긴다.
        const row = await lockBalance(challengerId, t);

        const open = await PointDuel.count({
          where: { challengerId, status: 'waiting' },
          transaction: t,
        });
        if (open >= rules.maxOpenPerUser) {
          throw new AppError(
            429,
            `동시에 걸어 둘 수 있는 대결은 ${rules.maxOpenPerUser}판까지입니다.`
          );
        }

        const duplicate = await PointDuel.count({
          where: { challengerId, opponentId, status: 'waiting' },
          transaction: t,
        });
        if (duplicate > 0) {
          throw new AppError(409, '이 사람에게 신청한 대결이 아직 남아 있습니다.');
        }

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
            message,
            expiresAt: new Date(Date.now() + rules.expireMinutes * 60_000),
          },
          { transaction: t }
        );
      })
    );

    notify(
      opponentId,
      `${await displayName(challengerId)}님이 ${stake.toLocaleString()}P 를 걸고 대결을 신청했습니다.` +
        (message ? ` "${message}"` : ''),
      created.id
    );

    return view(await findOrFail(created.id), challengerId);
  },

  /** 상대가 손을 낸다. 승부와 정산이 한 트랜잭션에서 끝나며, 판을 먼저 잠가 이중 정산을 막는다. */
  async accept(opponentId: string, duelId: number, hand: DuelHand): Promise<DuelView> {
    // judge() 는 모르는 값을 패로 처리하므로, 잘못된 입력이 승부가 되지 않게 먼저 막는다.
    if (!isDuelHand(hand)) throw new AppError(400, '가위·바위·보 중에서 골라주세요.');

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

        const rows = await lockBothBalances(duel.challengerId, opponentId, t);
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

    const who = await displayName(opponentId);
    const toChallenger =
      settled.result === 'draw'
        ? `${who}님과의 대결은 비겼습니다. 건 포인트를 돌려받았습니다.`
        : settled.result === 'challenger'
          ? `${who}님과의 대결에서 이겼습니다! ${(settled.stake * 2).toLocaleString()}P 획득`
          : `${who}님과의 대결에서 졌습니다.`;
    notify(settled.challengerId, toChallenger, settled.id);

    return view(await findOrFail(settled.id), opponentId);
  },

  async decline(opponentId: string, duelId: number): Promise<void> {
    const duel = await findOrFail(duelId);
    if (duel.opponentId !== opponentId) throw new AppError(403, '나에게 온 대결이 아닙니다.');
    if (duel.status !== 'waiting') throw new AppError(409, '이미 끝난 대결입니다.');

    const refunded = await closeWithRefund(duelId, '대결 거절 환불');
    // 그 사이 만료 정리가 먼저 닫았으면 거절이 아니므로 성공으로 응답하지 않는다.
    if (!refunded) throw new AppError(409, '이미 끝난 대결입니다.');
    notify(duel.challengerId, `${await displayName(opponentId)}님이 대결을 거절했습니다.`, duelId);
  },

  /** 이긴 사람이 한마디를 남긴다. 조건부 갱신(taunt IS NULL)으로 한 판 한 번을 보장한다. */
  async taunt(userId: string, duelId: number, text: string): Promise<DuelView> {
    const message = cleanLine(text, DUEL_TAUNT_MAX);
    if (!message) throw new AppError(400, '한마디를 입력해주세요.');

    const duel = await findOrFail(duelId);
    if (duel.status !== 'done' || !duel.result || duel.result === 'draw') {
      throw new AppError(409, '이긴 판에서만 한마디를 남길 수 있습니다.');
    }
    const winnerId = duel.result === 'challenger' ? duel.challengerId : duel.opponentId;
    if (winnerId !== userId) throw new AppError(403, '이긴 사람만 한마디를 남길 수 있습니다.');
    const loserId = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;

    const [affected] = await PointDuel.update(
      { taunt: message },
      { where: { id: duelId, taunt: null } }
    );
    if (affected === 0) throw new AppError(409, '이미 한마디를 남겼습니다.');

    notify(loserId, `${await displayName(userId)}님의 한마디: "${message}"`, duelId);
    return view(await findOrFail(duelId), userId);
  },

  async cancel(challengerId: string, duelId: number): Promise<void> {
    const duel = await findOrFail(duelId);
    if (duel.challengerId !== challengerId) throw new AppError(403, '내가 신청한 대결이 아닙니다.');
    if (duel.status !== 'waiting') throw new AppError(409, '이미 끝난 대결입니다.');

    if (!(await closeWithRefund(duelId, '대결 취소 환불'))) {
      throw new AppError(409, '이미 끝난 대결입니다.');
    }
  },
};
