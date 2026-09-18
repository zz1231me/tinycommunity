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
import { DUEL_MESSAGE_MAX, DUEL_TAUNT_MAX, cleanLine, judge } from '../config/duel';
import { getDuelSettings } from '../utils/settingsCache';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

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
  // 승부가 난 판에서만 손을 공개한다. 'waiting 이 아니면' 으로 두면 거절·취소·시간
  // 초과된 판에서도 신청자의 손이 상대에게 보인다. 거절은 공짜라서, 받는 쪽은 한 푼도
  // 쓰지 않고 상대가 무엇을 냈는지 계속 알아낼 수 있다 — 숨긴 정보가 이 기능의 전부인데
  // 그게 새는 길이 된다.
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
    // 승부가 나기 전(그리고 무효로 끝난 판)에는 신청자 본인에게만 보인다
    challengerHand: revealed || iAmChallenger ? duel.challengerHand : null,
    opponentHand: revealed ? duel.opponentHand : null,
    expiresAt: duel.expiresAt,
    settledAt: duel.settledAt,
    createdAt: duel.createdAt,
    // 신청자가 남긴 말은 가리지 않는다 — 상대에게 하는 말이다
    message: duel.message ?? null,
    taunt: duel.taunt ?? null,
  };
}

export type DuelView = ReturnType<typeof view>;

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

/**
 * 시간이 지난 판을 사람 가리지 않고 걷어 낸다. 서버가 주기적으로 부른다.
 *
 * sweepExpired 는 화면을 연 사람이 걸린 판만 정리한다. 그래서 신청자도 상대도
 * 한동안 접속하지 않으면 맡긴 포인트가 계속 묶여 있다 — 휴가나 퇴사면 영영 묶인다.
 * 그 구멍을 메우려고 서버가 스스로도 한 번씩 훑는다.
 *
 * 한 번에 걷는 양에 상한을 둔다. 밀린 것이 많아도 한 주기에 다 하려다 DB 를
 * 오래 붙잡는 것보다, 몇 주기에 나눠 끝내는 편이 낫다.
 */
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

/** 알림은 판의 정산과 묶지 않는다 — 알림이 실패해도 포인트는 이미 옳게 움직였다 */
function notify(userId: string, message: string, duelId: number): void {
  void notificationService
    .create({
      userId,
      type: 'DUEL',
      message,
      // 어느 판인지까지 싣는다. 탭만 가리키면 받은 사람이 화면을 내려가며 직접 찾아야 한다.
      link: `/profile?tab=points&duel=${duelId}`,
      relatedId: String(duelId),
    })
    .catch(err => logError('대결 알림 생성 실패', err, { userId, duelId }));
}

/**
 * 알림에 쓸 사람 이름. 아이디가 아니라 이름으로 부른다 —
 * 'duelalpha님이 신청했습니다' 는 받는 사람에게 누구인지 알려 주지 못한다.
 */
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
  /** 화면에 필요한 현재 상태 */
  async status(userId: string) {
    await sweepExpired(userId);
    const rules = getDuelSettings();

    const [balanceRow, incoming, outgoing, recent] = await Promise.all([
      UserPointModel.findByPk(userId, { attributes: ['UserId', 'balance'] }),
      PointDuel.findAll({
        where: { opponentId: userId, status: 'waiting' },
        include: withUsers,
        order: [['id', 'DESC']],
        // 받은 대결 수는 '내가 걸 수 있는 판 수' 와 상관이 없다. 그 설정으로 자르면
        // 스무 명에게 신청받았을 때 몇 개는 보이지도 않아 답할 수 없다.
        limit: 50,
      }),
      PointDuel.findAll({
        where: { challengerId: userId, status: 'waiting' },
        include: withUsers,
        order: [['id', 'DESC']],
        limit: rules.maxOpenPerUser,
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

  /**
   * 대결을 신청한다. 거는 포인트는 이 자리에서 바로 빠진다.
   *
   * 한도 확인과 차감을 같은 잠금 안에서 한다 — 밖에서만 확인하면 빠르게 여러 번 눌렀을 때
   * 잔액보다 많이 걸 수 있다.
   */
  async create(
    challengerId: string,
    input: { opponentId: string; stake: number; hand: DuelHand; message?: string }
  ): Promise<DuelView> {
    const { opponentId, stake, hand } = input;
    const message = cleanLine(input.message, DUEL_MESSAGE_MAX);
    const rules = getDuelSettings();

    if (opponentId === challengerId) {
      throw new AppError(400, '자기 자신에게는 대결을 신청할 수 없습니다.');
    }
    // 스키마에서도 막지만 서비스에서도 확인한다 — 이 서비스를 다른 데서 부를 수 있다
    if (!Number.isInteger(stake) || stake < rules.minStake || stake > rules.maxStake) {
      throw new AppError(
        400,
        `걸 수 있는 포인트는 ${rules.minStake.toLocaleString()}~${rules.maxStake.toLocaleString()}P 입니다.`
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
        // 세기 전에 먼저 잠근다.
        //
        // 세는 것만으로는 아무도 막히지 않는다. 잠그지 않은 채 세면 같은 순간의 두
        // 요청이 같은 open 값을 읽고 둘 다 통과해, 걸어 둘 수 있는 판 수 상한이 넘친다.
        // (SQLite 는 쓰기를 통째로 줄 세우므로 드러나지 않는다. MySQL/PG 에서 드러난다.)
        // 이 사람이 판을 만드는 모든 길이 이 잔액 행을 지나므로, 여기서 잠그면 직렬화된다.
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

  /** 받은 사람이 거절한다 — 신청자가 건 포인트를 돌려받는다 */
  async decline(opponentId: string, duelId: number): Promise<void> {
    const duel = await findOrFail(duelId);
    if (duel.opponentId !== opponentId) throw new AppError(403, '나에게 온 대결이 아닙니다.');
    if (duel.status !== 'waiting') throw new AppError(409, '이미 끝난 대결입니다.');

    // 실제로 닫고 돌려준 경우에만 알린다. 그 사이 시간 초과로 이미 닫혔다면
    // 거절당한 것이 아닌데 '거절했습니다' 가 가서, 있지도 않은 일을 알리게 된다.
    const refunded = await closeWithRefund(duelId, '대결 거절 환불');
    if (refunded) {
      notify(
        duel.challengerId,
        `${await displayName(opponentId)}님이 대결을 거절했습니다.`,
        duelId
      );
    }
  },

  /**
   * 이긴 사람이 진 사람에게 한마디를 남긴다. 한 판에 한 번.
   *
   * '한 번' 은 조건부 갱신(taunt IS NULL)이 지킨다. 읽고 확인한 뒤 저장하면
   * 두 창에서 같은 순간에 보냈을 때 둘 다 통과해, 진 사람은 알림을 두 번 받는다.
   */
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

  /** 신청한 사람이 거둬들인다 */
  async cancel(challengerId: string, duelId: number): Promise<void> {
    const duel = await findOrFail(duelId);
    if (duel.challengerId !== challengerId) throw new AppError(403, '내가 신청한 대결이 아닙니다.');
    if (duel.status !== 'waiting') throw new AppError(409, '이미 끝난 대결입니다.');

    await closeWithRefund(duelId, '대결 취소 환불');
  },
};
