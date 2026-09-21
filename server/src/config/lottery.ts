// 로또(포인트 뽑기) 규칙의 형태와 기본값. 실제 값은 관리자 설정에서 온다.

/** 상품 한 칸. weight 는 백분율(%)이며, 합이 100 미만이면 나머지가 꽝이다. */
export interface LotteryPrize {
  /** 당첨 포인트 */
  amount: number;
  /** 당첨 확률(%) */
  weight: number;
}

export const LOTTERY_DEFAULTS = {
  prizes: [
    { amount: 1500, weight: 3 },
    { amount: 1000, weight: 10 },
    { amount: 700, weight: 30 },
    { amount: 50, weight: 50 },
  ] as LotteryPrize[],
  /** 하루에 뽑을 수 있는 횟수 */
  dailyLimit: 10,
  /** 하루 한 번 접속하면 주는 포인트 */
  attendanceBonus: 500,
  /** 한 번 뽑는 데 드는 포인트. 0 이면 공짜 */
  drawCost: 0,
};

/** 확률 합이 100 이 안 되면 그 나머지가 꽝이다 (기본값 기준 7%) */
export function blankWeight(prizes: LotteryPrize[]): number {
  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  return Math.max(0, 100 - total);
}

/**
 * 상품 목록이 쓸 수 있는 형태인지 확인한다.
 * 확률 합이 100 을 넘으면 뒤쪽 상품이 나오지 않으므로 저장 시점에 막는다.
 */
export function validatePrizes(value: unknown): LotteryPrize[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('상품을 한 개 이상 지정해주세요.');
  }
  if (value.length > 20) {
    throw new Error('상품은 최대 20개까지입니다.');
  }
  const prizes = value.map(raw => {
    const amount = Number((raw as LotteryPrize)?.amount);
    const weight = Number((raw as LotteryPrize)?.weight);
    if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) {
      throw new Error('당첨 포인트는 0 이상 1,000,000 이하의 정수여야 합니다.');
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      throw new Error('확률은 0 보다 크고 100 이하여야 합니다.');
    }
    // 소수점 둘째 자리까지만. 그 아래는 합계만 어긋나게 한다.
    return { amount, weight: Math.round(weight * 100) / 100 };
  });
  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  if (total > 100) {
    throw new Error(`확률의 합이 100%를 넘습니다 (현재 ${total}%).`);
  }
  return prizes;
}
