import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/sequelize';
import UserPointModel, { UserPoint } from '../models/UserPoint';
import { PointLedger, type PointReason } from '../models/PointLedger';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { getLotterySettings } from '../utils/settingsCache';
import { blankWeight, type LotteryPrize } from '../config/lottery';

/** 서버 기준 오늘 날짜 (YYYY-MM-DD). 하루의 경계는 서버 자정이다. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayRange(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

/** 가중치 추첨. 결과는 서버에서만 정한다. 반환값이 null 이면 꽝이다. */
export function drawPrize(
  prizes: LotteryPrize[],
  rng: () => number = cryptoRandom
): LotteryPrize | null {
  const blank = blankWeight(prizes);
  const total = prizes.reduce((sum, p) => sum + p.weight, 0) + blank;
  if (total <= 0) return null;

  let point = rng() * total;
  for (const prize of prizes) {
    point -= prize.weight;
    if (point < 0) return prize;
  }
  return null; // 남은 구간 = 꽝
}

/** [0,1) 균등 난수 */
function cryptoRandom(): number {
  return crypto.randomInt(0, 2 ** 30) / 2 ** 30;
}

/** 잔액 행 보장. 반드시 트랜잭션 밖에서 호출한다(안에서 하면 SQLite 에서 SQLITE_BUSY). */
async function ensureBalanceRow(userId: string): Promise<void> {
  const existing = await UserPoint.findByPk(userId, { attributes: ['UserId'] });
  if (existing) return;
  try {
    await UserPoint.create({ UserId: userId });
  } catch {
    // 동시 생성 시 중복 오류는 무시한다
  }
}

/** 잔액 행을 잠근 채 가져온다 (행은 ensureBalanceRow 로 미리 만들어져 있다) */
async function lockBalance(userId: string, t: Transaction): Promise<UserPointModel> {
  const row = await UserPoint.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!row) throw new AppError(500, '포인트 정보를 찾지 못했습니다.');
  return row;
}

/**
 * 두 사람의 잔액 행을 아이디 순으로 잠근다(교착 방지).
 * 포인트가 움직이지 않는 쪽도 함께 잠가야 중간에 다른 요청이 끼어들지 않는다.
 * 두 사람 모두 ensureBalanceRow 가 선행되어야 한다.
 */
async function lockBothBalances(
  a: string,
  b: string,
  t: Transaction
): Promise<Record<string, UserPointModel>> {
  const [first, second] = a < b ? [a, b] : [b, a];
  const firstRow = await lockBalance(first, t);
  const secondRow = await lockBalance(second, t);
  return { [first]: firstRow, [second]: secondRow };
}

/** 쓰기 잠금 충돌 여부. 한도 초과 같은 AppError 는 재시도 대상이 아니다. */
function isLockConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /SQLITE_BUSY|database is locked|deadlock|Lock wait timeout/i.test(message);
}

/** 잠금 대기 시간 초과. 한 번에 50초를 붙잡으므로 재시도 횟수를 따로 줄인다. */
function isLockWaitTimeout(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Lock wait timeout/i.test(message);
}

async function withLockRetry<T>(run: () => Promise<T>, attempts = 12): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (err) {
      const limit = isLockWaitTimeout(err) ? Math.min(attempts, 2) : attempts;
      if (i >= limit - 1 || !isLockConflict(err)) throw err;
      // 지수적 대기에 흔들림을 더해 재충돌을 줄인다
      const wait = Math.min(20 * (i + 1), 150) + Math.floor(Math.random() * 40);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
}

/** 잔액과 원장을 한 트랜잭션에서 함께 움직인다 */
async function apply(
  row: UserPointModel,
  amount: number,
  reason: PointReason,
  memo: string,
  t: Transaction
): Promise<number> {
  const next = row.balance + amount;
  row.balance = next;
  await row.save({ transaction: t });
  await PointLedger.create(
    { UserId: row.UserId, amount, reason, balanceAfter: next, memo },
    { transaction: t }
  );
  return next;
}

// 포인트를 움직이는 다른 서비스가 같은 잠금 규칙을 쓰도록 내보낸다. 복제하지 말 것.
export { ensureBalanceRow, lockBalance, lockBothBalances, apply, withLockRetry };

export const pointService = {
  /** 화면에 필요한 현재 상태 */
  async getStatus(userId: string) {
    const { prizes, dailyLimit, attendanceBonus, drawCost } = getLotterySettings();
    const day = today();
    const { start, end } = dayRange(day);

    const [row, drawsToday] = await Promise.all([
      UserPoint.findByPk(userId),
      PointLedger.count({
        where: { UserId: userId, reason: 'lottery', createdAt: { [Op.gte]: start, [Op.lt]: end } },
      }),
    ]);

    return {
      balance: row?.balance ?? 0,
      drawsToday,
      dailyLimit,
      drawsLeft: Math.max(0, dailyLimit - drawsToday),
      attendanceBonus,
      drawCost,
      /** 지금 잔액으로 한 번 더 뽑을 수 있는가 */
      canAfford: (row?.balance ?? 0) >= drawCost,
      attendanceClaimedToday: row?.lastAttendanceOn === day,
      prizes,
      blankWeight: blankWeight(prizes),
    };
  },

  /** 하루 한 번 출석 보너스. lastAttendanceOn 을 잠근 채 확인·갱신해 중복 지급을 막는다. */
  async claimAttendance(
    userId: string
  ): Promise<{ granted: boolean; amount: number; balance: number }> {
    const { attendanceBonus } = getLotterySettings();
    await ensureBalanceRow(userId);

    // 대부분의 호출은 이미 받은 경우라 잠금 전에 걸러낸다. 아래 트랜잭션에서 다시 확인한다.
    const seen = await UserPoint.findByPk(userId, {
      attributes: ['UserId', 'balance', 'lastAttendanceOn'],
    });
    if (seen?.lastAttendanceOn === today()) {
      return { granted: false, amount: 0, balance: seen.balance };
    }

    return withLockRetry(() =>
      sequelize.transaction(async t => {
        const row = await lockBalance(userId, t);
        const day = today();
        if (row.lastAttendanceOn === day) {
          return { granted: false, amount: 0, balance: row.balance };
        }
        row.lastAttendanceOn = day;
        const balance = await apply(row, attendanceBonus, 'attendance', '출석 보너스', t);
        return { granted: true, amount: attendanceBonus, balance };
      })
    );
  },

  /** 로또 한 번. 하루 한도 확인과 지급을 같은 트랜잭션·잠금 안에서 해야 한도를 넘지 않는다. */
  async draw(userId: string): Promise<{
    amount: number;
    /** 이번 뽑기에 든 비용 */
    cost: number;
    isBlank: boolean;
    balance: number;
    drawsToday: number;
    drawsLeft: number;
  }> {
    const { prizes, dailyLimit, drawCost } = getLotterySettings();
    if (prizes.length === 0) throw new AppError(400, '추첨 상품이 설정되지 않았습니다.');
    await ensureBalanceRow(userId);

    return withLockRetry(() =>
      sequelize.transaction(async t => {
        const row = await lockBalance(userId, t);
        const { start, end } = dayRange(today());
        const drawsSoFar = await PointLedger.count({
          where: {
            UserId: userId,
            reason: 'lottery',
            createdAt: { [Op.gte]: start, [Op.lt]: end },
          },
          transaction: t,
        });
        if (drawsSoFar >= dailyLimit) {
          throw new AppError(
            429,
            `오늘은 ${dailyLimit}번을 모두 사용했습니다. 내일 다시 도전해주세요.`
          );
        }

        // 참가비. 잔액 확인과 차감은 같은 잠금 안에서 해야 한다.
        const cost = Math.max(0, drawCost);
        if (cost > 0) {
          if (row.balance < cost) {
            throw new AppError(
              400,
              `포인트가 모자랍니다. 한 번 뽑는 데 ${cost.toLocaleString()}P 가 필요합니다 (보유 ${row.balance.toLocaleString()}P).`
            );
          }
          await apply(row, -cost, 'lottery_cost', `뽑기 참가비 ${cost}p`, t);
        }

        const prize = drawPrize(prizes);
        const amount = prize?.amount ?? 0;
        const memo = prize ? `로또 ${amount}p 당첨` : '로또 꽝';
        const balance = await apply(row, amount, 'lottery', memo, t);

        const drawsToday = drawsSoFar + 1;
        return {
          amount,
          cost,
          isBlank: prize === null,
          balance,
          drawsToday,
          drawsLeft: Math.max(0, dailyLimit - drawsToday),
        };
      })
    );
  },

  /** 내 적립 내역 */
  async history(userId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const { rows, count } = await PointLedger.findAndCountAll({
      where: { UserId: userId },
      order: [['id', 'DESC']],
      limit: safeLimit,
      // page 상한이 없으면 offset 이 지수 표기가 되어 DB 오류가 난다
      offset: (Math.min(1000, Math.max(1, page)) - 1) * safeLimit,
    });
    return {
      entries: rows.map(r => ({
        id: r.id,
        amount: r.amount,
        reason: r.reason,
        memo: r.memo,
        balanceAfter: r.balanceAfter,
        createdAt: r.createdAt,
      })),
      total: count,
      page: Math.max(1, page),
      totalPages: Math.max(1, Math.ceil(count / safeLimit)),
    };
  },

  /**
   * 포인트 순위 — 상위 목록과 본인의 자리.
   * 비활성·삭제 계정 제외는 조인에서 해야 한다(가져온 뒤 거르면 목록만 짧아진다).
   * 동점 순서는 UserId 로 고정해야 새로고침해도 등수가 바뀌지 않는다.
   */
  async ranking(userId: string) {
    /** 순위표에 보이는 사람의 조건 */
    const visible = {
      model: User,
      as: 'user',
      attributes: ['id', 'name', 'avatar'],
      required: true,
      where: { isActive: true, isDeleted: false },
    };
    type Joined = { user?: { name?: string; avatar?: string | null } };
    const nameOf = (row: UserPointModel, fallback: string) =>
      (row as unknown as Joined).user?.name ?? fallback;
    const avatarOf = (row: UserPointModel) => (row as unknown as Joined).user?.avatar ?? null;

    const rows = await UserPoint.findAll({
      include: [visible],
      order: [
        ['balance', 'DESC'],
        ['UserId', 'ASC'],
      ],
      limit: 10,
    });

    const top = rows.map((row, i) => ({
      rank: i + 1,
      userId: row.UserId,
      name: nameOf(row, row.UserId),
      avatar: avatarOf(row),
      balance: row.balance,
    }));

    const mine = await UserPoint.findOne({ where: { UserId: userId }, include: [visible] });
    if (!mine) return { top, me: null };

    const already = top.find(t => t.userId === userId);
    if (already) return { top, me: already };

    // 나보다 위에 있는 사람 수 + 1. 정렬 기준과 동일해야 등수가 어긋나지 않는다.
    const above = await UserPoint.count({
      include: [visible],
      where: {
        [Op.or]: [
          { balance: { [Op.gt]: mine.balance } },
          { balance: mine.balance, UserId: { [Op.lt]: userId } },
        ],
      },
    });

    return {
      top,
      me: {
        rank: above + 1,
        userId,
        name: nameOf(mine, userId),
        avatar: avatarOf(mine),
        balance: mine.balance,
      },
    };
  },
};
