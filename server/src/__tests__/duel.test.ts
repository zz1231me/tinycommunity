import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';
import { PointLedger } from '../models/PointLedger';
import { PointDuel } from '../models/PointDuel';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { judge } from '../config/duel';
import { Notification } from '../models/Notification';

// 포인트 대결(가위바위보).
//
// 포인트가 오가는 기능이라 고정해야 할 것이 분명하다:
//   1) 신청자의 손은 승부가 나기 전까지 상대에게 보이지 않는다 — 보이면 대결이 아니다
//   2) 건 포인트는 신청하는 순간 빠진다(에스크로) — 나중에 받아내려 하면 못 받는다
//   3) 어떤 경로로 끝나든 잔액은 원장의 합과 같다
//   4) 한 판은 한 번만 정산된다

let aCookie: string;
let bCookie: string;
let cCookie: string;
const A = 'duelalpha';
const B = 'duelbravo';
const C = 'duelcharlie';

async function makeUser(id: string) {
  if (!(await User.findByPk(id))) {
    await User.create({
      id,
      password: 'Test1234!',
      name: `${id}이름`,
      email: `${id}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
  return loginAs(id, 'Test1234!');
}

async function setFlags(lottery: boolean, duel: boolean) {
  await FeatureFlag.destroy({ where: { key: 'tools.lottery' } });
  await FeatureFlag.destroy({ where: { key: 'tools.pointDuel' } });
  await FeatureFlag.create({ key: 'tools.lottery', enabled: lottery });
  await FeatureFlag.create({ key: 'tools.pointDuel', enabled: duel });
  featureFlagService.invalidate();
}

/** 원장에 근거를 남기면서 포인트를 쥐어 준다 — 잔액=원장합 불변식을 깨지 않으려면 둘 다 필요하다 */
async function grant(userId: string, amount: number) {
  await UserPoint.destroy({ where: { UserId: userId } });
  await UserPoint.create({ UserId: userId, balance: amount });
  await PointLedger.create({
    UserId: userId,
    amount,
    reason: 'admin',
    balanceAfter: amount,
    memo: '테스트 지급',
  });
}

async function balanceOf(userId: string): Promise<number> {
  return (await UserPoint.findByPk(userId))?.balance ?? 0;
}

/** 잔액은 언제나 원장의 합이어야 한다 */
async function expectLedgerConsistent(userId: string) {
  const sum = (await PointLedger.sum('amount', { where: { UserId: userId } })) || 0;
  expect(await balanceOf(userId)).toBe(sum);
}

const create = (cookie: string, body: Record<string, unknown>) =>
  request(app).post('/api/points/duels').set(CSRF_HEADER).set('Cookie', cookie).send(body);

const accept = (cookie: string, id: number, hand: string) =>
  request(app)
    .post(`/api/points/duels/${id}/accept`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ hand });

const decline = (cookie: string, id: number) =>
  request(app).post(`/api/points/duels/${id}/decline`).set(CSRF_HEADER).set('Cookie', cookie);

const cancel = (cookie: string, id: number) =>
  request(app).delete(`/api/points/duels/${id}`).set(CSRF_HEADER).set('Cookie', cookie);

const list = (cookie: string) => request(app).get('/api/points/duels').set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  aCookie = await makeUser(A);
  bCookie = await makeUser(B);
  cCookie = await makeUser(C);
});

beforeEach(async () => {
  await PointDuel.destroy({ where: {}, truncate: true });
  await PointLedger.destroy({ where: {}, truncate: true });
  await UserPoint.destroy({ where: {}, truncate: true });
  await setFlags(true, true);
});

describe('가위바위보 판정', () => {
  it('같은 손이면 비긴다', () => {
    expect(judge('rock', 'rock')).toBe('draw');
    expect(judge('paper', 'paper')).toBe('draw');
    expect(judge('scissors', 'scissors')).toBe('draw');
  });

  it('바위는 가위를 이기고 보에 진다', () => {
    expect(judge('rock', 'scissors')).toBe('challenger');
    expect(judge('rock', 'paper')).toBe('opponent');
  });

  it('가위는 보를 이기고 바위에 진다', () => {
    expect(judge('scissors', 'paper')).toBe('challenger');
    expect(judge('scissors', 'rock')).toBe('opponent');
  });

  it('보는 바위를 이기고 가위에 진다', () => {
    expect(judge('paper', 'rock')).toBe('challenger');
    expect(judge('paper', 'scissors')).toBe('opponent');
  });
});

describe('대결 신청', () => {
  it('신청하는 순간 건 포인트가 빠진다 — 나중에 받아내려 하면 못 받는다', async () => {
    await grant(A, 1000);
    const res = await create(aCookie, { opponentId: B, stake: 300, hand: 'rock' });
    expect(res.status).toBe(200);
    expect(await balanceOf(A)).toBe(700);
    await expectLedgerConsistent(A);
  });

  it('가진 것보다 많이 걸 수 없다', async () => {
    await grant(A, 100);
    const res = await create(aCookie, { opponentId: B, stake: 300, hand: 'rock' });
    expect(res.status).toBe(400);
    expect(await balanceOf(A)).toBe(100);
  });

  it('자기 자신에게는 신청할 수 없다', async () => {
    await grant(A, 1000);
    const res = await create(aCookie, { opponentId: A, stake: 100, hand: 'rock' });
    expect(res.status).toBe(400);
    expect(await balanceOf(A)).toBe(1000);
  });

  it('없는 사람에게는 신청할 수 없다', async () => {
    await grant(A, 1000);
    const res = await create(aCookie, { opponentId: '없는사람', stake: 100, hand: 'rock' });
    expect(res.status).toBe(404);
    expect(await balanceOf(A)).toBe(1000);
  });

  it('같은 상대에게 두 판을 동시에 걸어 두지 못한다', async () => {
    await grant(A, 1000);
    expect((await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' })).status).toBe(200);
    const second = await create(aCookie, { opponentId: B, stake: 100, hand: 'paper' });
    expect(second.status).toBe(409);
    // 거절된 신청 때문에 포인트가 빠지면 안 된다
    expect(await balanceOf(A)).toBe(900);
    await expectLedgerConsistent(A);
  });

  it('범위를 벗어난 금액은 막는다', async () => {
    await grant(A, 100000);
    expect((await create(aCookie, { opponentId: B, stake: 0, hand: 'rock' })).status).toBe(400);
    expect((await create(aCookie, { opponentId: B, stake: 999999, hand: 'rock' })).status).toBe(
      400
    );
    expect((await create(aCookie, { opponentId: B, stake: 1.5, hand: 'rock' })).status).toBe(400);
    expect(await balanceOf(A)).toBe(100000);
  });
});

describe('신청자의 손은 가려진다', () => {
  it('상대는 승부 전에 신청자의 손을 볼 수 없다', async () => {
    await grant(A, 1000);
    await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });

    const res = await list(bCookie);
    expect(res.status).toBe(200);
    const incoming = res.body.data.incoming;
    expect(incoming).toHaveLength(1);
    // 보이면 이기는 손을 내면 그만이다
    expect(incoming[0].challengerHand).toBeNull();
    // 응답 어디에도 손이 섞여 나가면 안 된다
    expect(JSON.stringify(res.body)).not.toContain('rock');
  });

  it('신청자 본인은 자기가 낸 손을 볼 수 있다', async () => {
    await grant(A, 1000);
    await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });

    const res = await list(aCookie);
    expect(res.body.data.outgoing[0].challengerHand).toBe('rock');
  });

  it('승부가 나면 양쪽 손이 모두 보인다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });
    await accept(bCookie, made.body.data.id, 'paper');

    const res = await list(bCookie);
    const done = res.body.data.recent[0];
    expect(done.challengerHand).toBe('rock');
    expect(done.opponentHand).toBe('paper');
  });

  it('거절한 판에서는 신청자의 손이 끝까지 보이지 않는다', async () => {
    // 거절은 공짜다. 거절할 때 손이 보이면, 받는 쪽은 한 푼도 쓰지 않고 상대가 무엇을
    // 냈는지 계속 알아낼 수 있다. 승부가 난 판에서만 공개해야 한다.
    await grant(A, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });
    await decline(bCookie, made.body.data.id);

    const res = await list(bCookie);
    const closed = res.body.data.recent[0];
    expect(closed.status).toBe('canceled');
    expect(closed.challengerHand).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('rock');
  });
});

describe('정산', () => {
  it('신청자가 이기면 두 배를 가져간다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 200, hand: 'rock' });
    const res = await accept(bCookie, made.body.data.id, 'scissors');

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('challenger');
    // A: 1000 −200(맡김) +400(승리) = 1200, B: 1000 −200 = 800
    expect(await balanceOf(A)).toBe(1200);
    expect(await balanceOf(B)).toBe(800);
    await expectLedgerConsistent(A);
    await expectLedgerConsistent(B);
  });

  it('받은 쪽이 이기면 받은 쪽이 두 배를 가져간다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 200, hand: 'rock' });
    const res = await accept(bCookie, made.body.data.id, 'paper');

    expect(res.body.data.result).toBe('opponent');
    expect(await balanceOf(A)).toBe(800);
    expect(await balanceOf(B)).toBe(1200);
    await expectLedgerConsistent(A);
    await expectLedgerConsistent(B);
  });

  it('비기면 둘 다 그대로 돌려받는다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 200, hand: 'rock' });
    const res = await accept(bCookie, made.body.data.id, 'rock');

    expect(res.body.data.result).toBe('draw');
    expect(await balanceOf(A)).toBe(1000);
    expect(await balanceOf(B)).toBe(1000);
    await expectLedgerConsistent(A);
    await expectLedgerConsistent(B);
  });

  it('오간 포인트의 합은 0 이다 — 없던 포인트가 생기지 않는다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 500, hand: 'scissors' });
    await accept(bCookie, made.body.data.id, 'paper');

    expect((await balanceOf(A)) + (await balanceOf(B))).toBe(2000);
  });

  it('포인트가 모자라면 받을 수 없고, 판은 그대로 남는다', async () => {
    await grant(A, 1000);
    await grant(B, 50);
    const made = await create(aCookie, { opponentId: B, stake: 200, hand: 'rock' });
    const res = await accept(bCookie, made.body.data.id, 'paper');

    expect(res.status).toBe(400);
    expect(await balanceOf(B)).toBe(50);
    // 실패한 응수로 신청자의 맡긴 포인트가 사라지면 안 된다
    expect(await balanceOf(A)).toBe(800);
    const still = await PointDuel.findByPk(made.body.data.id);
    expect(still?.status).toBe('waiting');
  });
});

describe('한 판은 한 번만 정산된다', () => {
  it('두 번 받으면 두 번째는 거절된다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 200, hand: 'rock' });
    const id = made.body.data.id;

    expect((await accept(bCookie, id, 'scissors')).status).toBe(200);
    expect((await accept(bCookie, id, 'scissors')).status).toBe(409);

    expect(await balanceOf(A)).toBe(1200);
    expect(await balanceOf(B)).toBe(800);
    await expectLedgerConsistent(B);
  });

  it('동시에 눌러도 한 번만 정산된다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 200, hand: 'rock' });
    const id = made.body.data.id;

    const results = await Promise.all([
      accept(bCookie, id, 'scissors'),
      accept(bCookie, id, 'scissors'),
      accept(bCookie, id, 'scissors'),
    ]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);

    expect(await balanceOf(A)).toBe(1200);
    expect(await balanceOf(B)).toBe(800);
    await expectLedgerConsistent(A);
    await expectLedgerConsistent(B);
  });

  it('남의 대결을 대신 받을 수 없다', async () => {
    await grant(A, 1000);
    await grant(C, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 200, hand: 'rock' });
    const res = await accept(cCookie, made.body.data.id, 'paper');

    expect(res.status).toBe(403);
    expect(await balanceOf(C)).toBe(1000);
  });
});

describe('물러서기', () => {
  it('거절하면 신청자가 돌려받는다', async () => {
    await grant(A, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 300, hand: 'rock' });
    expect(await balanceOf(A)).toBe(700);

    const res = await decline(bCookie, made.body.data.id);
    expect(res.status).toBe(200);
    expect(await balanceOf(A)).toBe(1000);
    await expectLedgerConsistent(A);
  });

  it('신청자가 거둬들이면 돌려받는다', async () => {
    await grant(A, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 300, hand: 'rock' });

    expect((await cancel(aCookie, made.body.data.id)).status).toBe(200);
    expect(await balanceOf(A)).toBe(1000);
    await expectLedgerConsistent(A);
  });

  it('두 번 거절해도 두 번 돌려주지 않는다', async () => {
    await grant(A, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 300, hand: 'rock' });
    const id = made.body.data.id;

    await decline(bCookie, id);
    expect((await decline(bCookie, id)).status).toBe(409);
    expect(await balanceOf(A)).toBe(1000);
    await expectLedgerConsistent(A);
  });

  it('상대가 내 대결을 취소할 수는 없다', async () => {
    await grant(A, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 300, hand: 'rock' });

    expect((await cancel(bCookie, made.body.data.id)).status).toBe(403);
    expect(await balanceOf(A)).toBe(700);
  });
});

describe('기능 스위치', () => {
  it('대결이 꺼져 있으면 화면에서 숨기는 것과 별개로 API 가 막힌다', async () => {
    await setFlags(true, false);
    await grant(A, 1000);

    expect((await list(aCookie)).status).toBe(403);
    expect((await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' })).status).toBe(403);
    expect(await balanceOf(A)).toBe(1000);
  });

  it('포인트 기능 자체가 꺼지면 대결도 함께 닫힌다', async () => {
    await setFlags(false, true);
    expect((await list(aCookie)).status).toBe(403);
  });
});

describe('알림은 사람을 이름으로 부른다', () => {
  /** 잠깐 기다린다 — 알림은 정산과 묶지 않고 뒤따라 만들어진다 */
  async function notificationsFor(userId: string) {
    for (let i = 0; i < 20; i++) {
      const rows = await Notification.findAll({ where: { userId, type: 'DUEL' } });
      if (rows.length > 0) return rows;
      await new Promise(r => setTimeout(r, 25));
    }
    return Notification.findAll({ where: { userId, type: 'DUEL' } });
  }

  beforeEach(async () => {
    await Notification.destroy({ where: {}, truncate: true });
  });

  it('신청 알림에 로그인 아이디가 아니라 이름이 들어간다', async () => {
    // 'duelalpha님이 신청했습니다' 는 받는 사람에게 누구인지 알려 주지 못한다
    await grant(A, 1000);
    await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });

    const rows = await notificationsFor(B);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain(`${A}이름`);
    expect(rows[0].message).not.toMatch(new RegExp(`(^|[^가-힣])${A}님`));
  });

  it('결과 알림에도 이름이 들어간다', async () => {
    await grant(A, 1000);
    await grant(B, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });
    await Notification.destroy({ where: {}, truncate: true });
    await accept(bCookie, made.body.data.id, 'scissors');

    const rows = await notificationsFor(A);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain(`${B}이름`);
  });

  it('알림을 누르면 그 판으로 바로 가도록 판 번호를 싣는다', async () => {
    // 탭만 가리키면 받은 사람이 포인트 화면을 내려가며 직접 찾아야 한다
    await grant(A, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });

    const rows = await notificationsFor(B);
    expect(rows[0].link).toBe(`/profile?tab=points&duel=${made.body.data.id}`);
  });

  it('시간이 지나 이미 닫힌 판을 거절해도 거절 알림은 가지 않는다', async () => {
    // 거절당한 것이 아닌데 '거절했습니다' 가 가면 있지도 않은 일을 알리게 된다
    await grant(A, 1000);
    const made = await create(aCookie, { opponentId: B, stake: 100, hand: 'rock' });
    const id = made.body.data.id;

    // 상대가 거절 버튼을 누르기 직전에 만료 정리가 먼저 닫아 버린 상황
    await PointDuel.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id } });
    await list(bCookie); // 조회하면서 만료분이 정리된다
    await Notification.destroy({ where: {}, truncate: true });

    await decline(bCookie, id);
    const rows = await Notification.findAll({ where: { userId: A, type: 'DUEL' } });
    expect(rows).toHaveLength(0);
  });
});
