// server/src/services/point.service.ts
import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/sequelize';
import UserPointModel, { UserPoint } from '../models/UserPoint';
import { PointLedger, type PointReason } from '../models/PointLedger';
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

/**
 * 가중치 추첨.
 *
 * Math.random 대신 crypto 를 쓰는 이유: 포인트가 걸린 추첨이라 예측 가능성이
 * 남아 있으면 안 된다. 결과는 오직 서버에서만 정해진다 — 화면이 보내온 값은
 * 어떤 것도 결과에 관여하지 않는다.
 *
 * 반환값이 null 이면 꽝(확률 합이 100 미만일 때 남는 몫)이다.
 */
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

/**
 * 잔액 행이 있는지 보장한다. 트랜잭션 '밖에서' 부른다.
 *
 * 트랜잭션 안에서 findOrCreate 를 부르면 Sequelize 가 세이브포인트를 따로 열고,
 * SQLite 에서는 그 중첩이 같은 커넥션의 쓰기 잠금과 부딪혀 SQLITE_BUSY 로 떨어졌다
 * (버튼을 빠르게 두 번 누르면 500). 행 만들기는 잠금이 필요 없는 일이므로 밖으로 뺀다.
 */
async function ensureBalanceRow(userId: string): Promise<void> {
  const existing = await UserPoint.findByPk(userId, { attributes: ['UserId'] });
  if (existing) return;
  try {
    await UserPoint.create({ UserId: userId });
  } catch {
    // 동시에 둘이 만들면 한쪽은 중복 오류 — 이미 있으면 그걸로 충분하다
  }
}

/** 잔액 행을 잠근 채 가져온다 (행은 ensureBalanceRow 로 미리 만들어져 있다) */
async function lockBalance(userId: string, t: Transaction): Promise<UserPointModel> {
  const row = await UserPoint.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!row) throw new AppError(500, '포인트 정보를 찾지 못했습니다.');
  return row;
}

/**
 * 쓰기 잠금이 겹쳤을 때만 잠깐 쉬었다 다시 한다.
 *
 * SQLite 는 잠금이 잡혀 있으면 기다리지 않고 SQLITE_BUSY 로 실패한다(MySQL/PG 는
 * 대기하다 데드락이면 실패). 뽑기 버튼을 연타하면 쉽게 겹치므로 짧게 다시 시도한다.
 *
 * 한도 초과(AppError) 같은 정상적인 거절은 재시도하지 않는다.
 */
function isLockConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /SQLITE_BUSY|database is locked|deadlock|Lock wait timeout/i.test(message);
}

async function withLockRetry<T>(run: () => Promise<T>, attempts = 12): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (err) {
      if (i >= attempts - 1 || !isLockConflict(err)) throw err;
      // 조금씩 늘려 가며 기다린다. 같은 순간에 몰린 요청이 다시 같은 순간에 몰리지 않도록 흔든다.
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
      /** 지금 잔액으로 한 번 더 뽑을 수 있는가 (비용이 0 이면 항상 true) */
      canAfford: (row?.balance ?? 0) >= drawCost,
      attendanceClaimedToday: row?.lastAttendanceOn === day,
      // 확률표는 숨길 이유가 없다 — 오히려 공개해야 신뢰할 수 있다
      prizes,
      blankWeight: blankWeight(prizes),
    };
  },

  /**
   * 하루 한 번 출석 보너스.
   *
   * lastAttendanceOn 을 잠근 채 확인하고 바꾸므로, 같은 사람이 여러 창에서
   * 동시에 눌러도 하루 한 번만 지급된다.
   */
  async claimAttendance(
    userId: string
  ): Promise<{ granted: boolean; amount: number; balance: number }> {
    const { attendanceBonus } = getLotterySettings();
    await ensureBalanceRow(userId);

    // 이미 오늘 받았으면 잠금까지 갈 것 없이 돌아간다.
    // 토큰 갱신마다 불리는 자리라, 대부분의 호출은 "이미 받음" 이다 —
    // 그때마다 쓰기 트랜잭션을 여는 건 아무것도 바꾸지 않으면서 잠금만 붙잡는 일이다.
    // 판단의 근거는 아래 트랜잭션 안에서 다시 확인하므로, 여기서 틀려도 이중 지급은 없다.
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

  /**
   * 로또 한 번.
   *
   * 하루 한도 확인과 지급을 같은 트랜잭션·같은 잠금 안에서 한다. 확인만 밖에서 하면
   * 동시에 열 번을 넘겨 뽑을 수 있다(확인과 기록 사이에 다른 요청이 끼어든다).
   */
  async draw(userId: string): Promise<{
    amount: number;
    /** 이번 뽑기에 든 비용 (0 이면 공짜) */
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

        // 참가비. 잔액 확인과 차감을 같은 잠금 안에서 한다 —
        // 밖에서 확인하면 빠르게 여러 번 눌렀을 때 잔액보다 많이 쓸 수 있다.
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
      offset: (Math.max(1, page) - 1) * safeLimit,
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
};
