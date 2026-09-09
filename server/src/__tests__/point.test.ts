import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER, relaxRateLimits } from './helpers';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';
import { PointLedger } from '../models/PointLedger';
import { SiteSettings } from '../models';
import { refreshSettingsCache } from '../utils/settingsCache';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { drawPrize } from '../services/point.service';
import { blankWeight } from '../config/lottery';

// 포인트 뽑기.
//
// 포인트가 걸린 기능이라 "대충 맞으면 된다" 가 통하지 않는다. 세 가지를 고정한다:
//   1) 결과는 서버가 정한다 — 화면이 보낸 값은 결과에 관여하지 못한다
//   2) 하루 한도는 동시에 눌러도 뚫리지 않는다
//   3) 잔액은 언제나 원장의 합과 같다

let cookie: string;
const USER = 'pointuser';

beforeAll(async () => {
  await seedTestData();
  await relaxRateLimits();
  if (!(await User.findByPk(USER))) {
    await User.create({
      id: USER,
      password: 'Test1234!',
      name: '포인트유저',
      email: `${USER}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
  cookie = await loginAs(USER, 'Test1234!');
  await setLottery(true);
});

beforeEach(async () => {
  await PointLedger.destroy({ where: {}, truncate: true });
  await UserPoint.destroy({ where: {}, truncate: true });
  // 다른 스위트가 기능 스위치 표를 비우고 지나갈 수 있다. 이 기능은 기본값이 '꺼짐' 이라
  // 그대로 두면 여기 테스트가 403 을 받는다 — 매번 다시 켠다.
  await setLottery(true);
});

const draw = () => request(app).post('/api/points/lottery').set(CSRF_HEADER).set('Cookie', cookie);
const status = () => request(app).get('/api/points/me').set('Cookie', cookie);
const attend = () =>
  request(app).post('/api/points/attendance').set(CSRF_HEADER).set('Cookie', cookie);

/** 스위치를 직접 세운다 (기본값이 꺼짐이라 켜 두고 시작한다) */
async function setLottery(enabled: boolean) {
  await FeatureFlag.destroy({ where: { key: 'tools.lottery' } });
  await FeatureFlag.create({ key: 'tools.lottery', enabled });
  featureFlagService.invalidate();
}

async function setRules(patch: Record<string, unknown>) {
  await SiteSettings.update(patch, { where: {} });
  await refreshSettingsCache();
}

describe('추첨 자체', () => {
  it('확률 합이 100 미만이면 나머지는 꽝이다', () => {
    const prizes = [
      { amount: 1500, weight: 3 },
      { amount: 1000, weight: 10 },
      { amount: 700, weight: 30 },
      { amount: 50, weight: 50 },
    ];
    expect(blankWeight(prizes)).toBe(7);

    // 난수를 직접 넣어 구간 경계를 확인한다 (0~3 = 1500p, 3~13 = 1000p, ... 93~100 = 꽝)
    const at = (pct: number) => drawPrize(prizes, () => pct / 100);
    expect(at(0)?.amount).toBe(1500);
    expect(at(2.9)?.amount).toBe(1500);
    expect(at(3.1)?.amount).toBe(1000);
    expect(at(12.9)?.amount).toBe(1000);
    expect(at(13.1)?.amount).toBe(700);
    expect(at(42.9)?.amount).toBe(700);
    expect(at(43.1)?.amount).toBe(50);
    expect(at(92.9)?.amount).toBe(50);
    expect(at(93.1)).toBeNull(); // 꽝
    expect(at(99.9)).toBeNull();
  });

  it('확률 합이 100 이면 꽝이 없다', () => {
    const prizes = [
      { amount: 100, weight: 50 },
      { amount: 10, weight: 50 },
    ];
    expect(blankWeight(prizes)).toBe(0);
    for (let i = 0; i < 100; i++) {
      expect(drawPrize(prizes, () => i / 100)).not.toBeNull();
    }
  });

  it('많이 돌리면 설정한 확률에 수렴한다', () => {
    const prizes = [
      { amount: 1500, weight: 3 },
      { amount: 50, weight: 50 },
    ];
    const N = 20000;
    let big = 0;
    for (let i = 0; i < N; i++) {
      if (drawPrize(prizes)?.amount === 1500) big++;
    }
    // 3% 기대. 표본 오차를 감안해 1.5~5% 안에 들어오면 통과로 본다.
    expect(big / N).toBeGreaterThan(0.015);
    expect(big / N).toBeLessThan(0.05);
  });
});

describe('하루 한도', () => {
  it('설정한 횟수만큼만 뽑을 수 있다', async () => {
    await setRules({ lotteryDailyLimit: 3 });
    for (let i = 0; i < 3; i++) expect((await draw()).status).toBe(200);

    const over = await draw();
    expect(over.status).toBe(429);
    expect(over.body.message).toContain('3');

    const s = await status();
    expect(s.body.data.drawsToday).toBe(3);
    expect(s.body.data.drawsLeft).toBe(0);
  });

  it('동시에 눌러도 한도를 넘지 못한다', async () => {
    // 확인과 기록이 따로 놀면 여기서 한도가 뚫린다.
    //
    // 개수를 5/7 로 못박지 않는 이유: 한 번에 열두 개를 쏘면 전송 계층에서 몇 개가
    // 떨어져 나갈 수 있고(전체 스위트를 함께 돌릴 때 특히), 그건 이 기능의 문제가 아니다.
    // 여기서 지켜야 할 것은 "한도를 넘지 않는다" 와 "성공한 수만큼만 기록된다" 이다 —
    // 잠금이 깨지면 성공 수가 한도를 넘으므로 그대로 잡힌다.
    await setRules({ lotteryDailyLimit: 5 });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => draw()));
    const statuses = results
      .map(r => (r.status === 'fulfilled' ? r.value.status : 0))
      .filter(Boolean);
    const ok = statuses.filter(s => s === 200).length;

    expect(ok).toBeLessThanOrEqual(5);
    expect(statuses.filter(s => s !== 200 && s !== 429)).toEqual([]);
    expect(await PointLedger.count({ where: { UserId: USER, reason: 'lottery' } })).toBe(ok);

    // 남은 요청은 한도 초과로 거절되어야 한다(성공이 한도를 채웠다면)
    if (ok === 5) expect(statuses.filter(s => s === 429).length).toBeGreaterThan(0);
  });

  it('꽝도 한 번으로 센다', async () => {
    // 꽝일 때 기록을 남기지 않으면 무한히 다시 뽑을 수 있다
    await setRules({
      lotteryDailyLimit: 4,
      lotteryPrizes: JSON.stringify([{ amount: 10, weight: 1 }]),
    });
    for (let i = 0; i < 4; i++) await draw();
    expect((await draw()).status).toBe(429);
    expect(await PointLedger.count({ where: { UserId: USER, reason: 'lottery' } })).toBe(4);
  });
});

/** 뒷일로 도는 출석 지급이 기록에 남을 때까지 기다린다(최대 3초) */
async function waitForAttendanceRows(want: number): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if ((await PointLedger.count({ where: { UserId: USER, reason: 'attendance' } })) >= want)
      return;
    await new Promise(r => setTimeout(r, 50));
  }
}

describe('출석 포인트', () => {
  it('하루에 한 번만 받는다', async () => {
    await setRules({ attendanceBonus: 500 });
    const first = await attend();
    expect(first.status).toBe(200);
    expect(first.body.data.granted).toBe(true);
    expect(first.body.data.balance).toBe(500);

    const second = await attend();
    expect(second.body.data.granted).toBe(false);
    expect(second.body.data.balance).toBe(500);
  });

  // 창을 열어 둔 채 리프레시 토큰으로 며칠을 이어 쓰는 경우가 있다. 로그인 때만 주면
  // "접속하면 하루 한 번" 이라는 안내와 달리 받지 못하는 사용자가 생긴다.
  it('토큰 갱신만 해도 그날 몫을 받는다', async () => {
    await setRules({ attendanceBonus: 500 });

    const fresh = await loginAs(USER, 'Test1234!');
    // 로그인이 주는 몫은 응답을 붙잡지 않는 뒷일이다. 그게 끝난 뒤에 지워야,
    // 뒤늦게 도착한 로그인 몫을 갱신이 준 것으로 잘못 세지 않는다.
    await waitForAttendanceRows(1);
    await PointLedger.destroy({ where: { UserId: USER, reason: 'attendance' } });
    await UserPoint.update({ balance: 0, lastAttendanceOn: null }, { where: { UserId: USER } });
    expect(await PointLedger.count({ where: { UserId: USER, reason: 'attendance' } })).toBe(0);

    const res = await request(app).post('/api/auth/refresh').set(CSRF_HEADER).set('Cookie', fresh);
    expect(res.status).toBe(200);

    await waitForAttendanceRows(1);
    expect(await PointLedger.count({ where: { UserId: USER, reason: 'attendance' } })).toBe(1);
    expect((await UserPoint.findByPk(USER))?.balance).toBe(500);
  });

  it('동시에 눌러도 한 번만 지급된다', async () => {
    await setRules({ attendanceBonus: 500 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => attend()));
    const granted = results.filter(
      r => r.status === 'fulfilled' && r.value.body?.data?.granted
    ).length;
    expect(granted).toBeLessThanOrEqual(1);
    // 지급 기록은 아무리 동시에 눌러도 하루 한 줄뿐이다
    expect(await PointLedger.count({ where: { UserId: USER, reason: 'attendance' } })).toBe(
      granted
    );
  });
});

describe('잔액과 원장', () => {
  it('잔액은 언제나 원장의 합과 같다', async () => {
    await setRules({ lotteryDailyLimit: 10, attendanceBonus: 500 });
    await attend();
    for (let i = 0; i < 10; i++) await draw();

    const rows = await PointLedger.findAll({ where: { UserId: USER } });
    const sum = rows.reduce((acc, r) => acc + r.amount, 0);
    const row = await UserPoint.findByPk(USER);
    expect(row?.balance).toBe(sum);

    const s = await status();
    expect(s.body.data.balance).toBe(sum);
  });

  it('내역에 꽝도 남는다', async () => {
    await setRules({ lotteryDailyLimit: 5 });
    for (let i = 0; i < 5; i++) await draw();
    const res = await request(app).get('/api/points/history').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.entries.length).toBe(5);
    expect(res.body.data.entries.every((e: { reason: string }) => e.reason === 'lottery')).toBe(
      true
    );
  });
});

describe('설정은 관리자만, 규칙은 서버가', () => {
  it('화면이 보낸 당첨 금액은 무시된다', async () => {
    await setRules({
      lotteryDailyLimit: 1,
      lotteryPrizes: JSON.stringify([{ amount: 10, weight: 100 }]),
    });
    const res = await draw().send({ amount: 999999, prize: 999999 });
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(10);
  });

  it('기능 스위치를 끄면 API 도 막힌다', async () => {
    await setLottery(false);
    try {
      expect((await draw()).status).toBe(403);
      expect((await status()).status).toBe(403);
    } finally {
      await setLottery(true);
    }
  });

  it('로그인하지 않으면 뽑을 수 없다', async () => {
    expect((await request(app).post('/api/points/lottery').set(CSRF_HEADER)).status).toBe(401);
  });
});

// 뽑기 참가비 — 포인트가 깎이는 유일한 경로다.
// 잔액 확인과 차감이 같은 잠금 안에서 일어나지 않으면, 빠르게 여러 번 누를 때
// 가진 것보다 많이 써서 잔액이 마이너스로 내려간다.
describe('뽑기 참가비', () => {
  afterEach(async () => {
    await setRules({ lotteryDrawCost: 0 });
  });

  it('참가비만큼 깎고, 원장에 따로 한 줄로 남는다', async () => {
    await setRules({ lotteryDailyLimit: 10, lotteryDrawCost: 100 });
    await UserPoint.upsert({ UserId: USER, balance: 1000 });

    const res = await draw();
    expect(res.status).toBe(200);
    expect(res.body.data.cost).toBe(100);

    const costRows = await PointLedger.findAll({
      where: { UserId: USER, reason: 'lottery_cost' },
    });
    expect(costRows).toHaveLength(1);
    expect(costRows[0].amount).toBe(-100);

    // 잔액 = 1000 - 참가비 + 당첨금
    const row = await UserPoint.findByPk(USER);
    expect(row?.balance).toBe(1000 - 100 + res.body.data.amount);
  });

  it('잔액이 참가비보다 적으면 거절하고, 아무것도 깎지 않는다', async () => {
    await setRules({ lotteryDailyLimit: 10, lotteryDrawCost: 500 });
    await UserPoint.upsert({ UserId: USER, balance: 100 });

    const res = await draw();
    expect(res.status).toBe(400);

    const row = await UserPoint.findByPk(USER);
    expect(row?.balance).toBe(100);
    expect(await PointLedger.count({ where: { UserId: USER } })).toBe(0);
  });

  it('동시에 눌러도 잔액이 마이너스로 내려가지 않는다', async () => {
    await setRules({ lotteryDailyLimit: 10, lotteryDrawCost: 100 });
    // 참가비 100 짜리를 3번만 할 수 있는 잔액
    await UserPoint.upsert({ UserId: USER, balance: 300 });
    // 당첨금이 섞이면 판단이 흐려지므로 전부 꽝인 표로 바꾼다
    await setRules({ lotteryPrizes: JSON.stringify([{ amount: 0, weight: 1 }]) });

    await Promise.allSettled(Array.from({ length: 8 }, () => draw()));

    const row = await UserPoint.findByPk(USER);
    expect(row?.balance).toBeGreaterThanOrEqual(0);

    // 잔액은 언제나 원장의 합과 같아야 한다
    const rows = await PointLedger.findAll({ where: { UserId: USER } });
    const sum = rows.reduce((acc, r) => acc + r.amount, 0);
    expect(row?.balance).toBe(300 + sum);
  });

  it('참가비가 0 이면 아무것도 깎지 않는다', async () => {
    await setRules({ lotteryDailyLimit: 10, lotteryDrawCost: 0 });
    await UserPoint.upsert({ UserId: USER, balance: 0 });

    const res = await draw();
    expect(res.status).toBe(200);
    expect(res.body.data.cost).toBe(0);
    expect(await PointLedger.count({ where: { UserId: USER, reason: 'lottery_cost' } })).toBe(0);
  });
});
