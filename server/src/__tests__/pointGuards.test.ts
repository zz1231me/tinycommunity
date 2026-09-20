// server/src/__tests__/pointGuards.test.ts
// 포인트가 걸린 자리에서 '잘못된 값' 이 오류가 아니라 결과가 되지 않는가.

import { seedTestData } from './helpers';
import { SiteSettings } from '../models/SiteSettings';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';
import { PointDuel } from '../models/PointDuel';
import { duelService } from '../services/duel.service';
import { refreshSettingsCache, getLotterySettings } from '../utils/settingsCache';
import type { DuelHand } from '../config/duel';

const A = 'admin';
const B = 'testuser';

async function grant(userId: string, amount: number) {
  await UserPoint.upsert({ UserId: userId, balance: amount });
}

/** 상대 여럿이 필요한 검사용 — 씨앗에는 두 명뿐이다 */
const OPPONENTS = ['pgfoe1', 'pgfoe2', 'pgfoe3'];

beforeAll(async () => {
  await seedTestData();
  for (const id of OPPONENTS) {
    await User.findOrCreate({
      where: { id },
      defaults: {
        id,
        name: id,
        password: 'x'.repeat(60),
        roleId: 'user',
        isActive: true,
        isApproved: true,
      } as never,
    });
  }
});

beforeEach(async () => {
  await PointDuel.destroy({ where: {} });
});

/** 이 스위트에서 건드린 설정을 원래대로 — 뒤 테스트가 엉뚱한 값으로 돌지 않게 */
let originalPrizes: string;

beforeAll(async () => {
  const row = await SiteSettings.findOne();
  originalPrizes = row?.lotteryPrizes ?? '[]';
});

afterEach(async () => {
  await SiteSettings.update({ lotteryPrizes: originalPrizes }, { where: {} });
  await refreshSettingsCache();
});

describe('뽑기 상품 목록을 읽을 때도 금액을 본다', () => {
  // 저장할 때는 0 이상의 정수만 받는다. 읽을 때는 보지 않아서, 어떤 이유로든 음수가 들어 있으면
  // '당첨' 이 오히려 잔액을 깎았다 — 포인트를 더하는 그 자리에는 잔액 확인이 없다.
  it('음수·소수 금액은 목록에서 걸러 낸다', async () => {
    await SiteSettings.update(
      {
        lotteryPrizes: JSON.stringify([
          { amount: -500, weight: 50 },
          { amount: 10.5, weight: 20 },
          { amount: 100, weight: 30 },
        ]),
      },
      { where: {} }
    );
    await refreshSettingsCache();

    const prizes = getLotterySettings().prizes;

    expect(prizes.every(p => Number.isInteger(p.amount) && p.amount >= 0)).toBe(true);
    expect(prizes.map(p => p.amount)).toContain(100);
  });
});

describe('대결에서 낸 손', () => {
  it('가위바위보가 아닌 값은 거절한다 — 심판이 상대 승으로 읽지 않게', async () => {
    await grant(A, 5000);
    await grant(B, 5000);
    const made = await duelService.create(A, { opponentId: B, stake: 100, hand: 'rock' });

    await expect(
      duelService.accept(B, made.id, 'ROCK!' as unknown as DuelHand)
    ).rejects.toMatchObject({ statusCode: 400 });

    const row = await PointDuel.findByPk(made.id);
    expect(row!.status).toBe('waiting'); // 정산되지 않았다
  });

  it('제대로 낸 손은 그대로 겨룬다 — 대조', async () => {
    await grant(A, 5000);
    await grant(B, 5000);
    const made = await duelService.create(A, { opponentId: B, stake: 100, hand: 'rock' });

    const done = await duelService.accept(B, made.id, 'paper');

    expect(done.status).toBe('done');
  });
});

describe('내가 건 대결 목록', () => {
  // 관리자가 '동시에 걸 수 있는 판 수' 를 줄이면, 이미 걸어 둔 판이 목록에서 사라져
  // 취소할 길이 없었다 — 건 포인트는 맡겨져 있는데 화면에서는 보이지 않는다.
  it('설정을 줄여도 걸어 둔 판이 사라지지 않는다', async () => {
    await grant(A, 50_000);
    for (const id of OPPONENTS) {
      await grant(id, 50_000);
      await duelService.create(A, { opponentId: id, stake: 100, hand: 'rock' });
    }

    await SiteSettings.update({ duelMaxOpenPerUser: 1 }, { where: {} });
    await refreshSettingsCache();
    const board = await duelService.status(A);

    expect(board.outgoing).toHaveLength(3);

    await SiteSettings.update({ duelMaxOpenPerUser: 3 }, { where: {} });
    await refreshSettingsCache();
  });
});
