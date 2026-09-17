import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';
import { PointLedger } from '../models/PointLedger';
import { AttendanceAttack } from '../models/AttendanceAttack';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { today } from '../services/point.service';
import { ATTACK_RULES } from '../config/attendanceAttack';

// 퇴근 쪽지(popup 공격).
//
// 남의 화면에 글이 그대로 뜨는 기능이라 두 가지를 특히 고정한다:
//   1) 길이는 서버가 자른다 — 길게 쓰라고 연 창구가 아니다
//   2) 누가 보냈는지 항상 남는다 — 익명이면 장난이 아니라 괴롭힘이 된다

let atkCookie: string;
let tgtCookie: string;
let thirdCookie: string;
const ATK = 'popalpha';
const TGT = 'poptarget';
const THIRD = 'popthird';

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

async function setFlags(on: boolean) {
  for (const key of ['tools.attendance', 'tools.lottery', 'tools.attendanceAttack']) {
    await FeatureFlag.destroy({ where: { key } });
  }
  await FeatureFlag.create({ key: 'tools.attendance', enabled: true });
  await FeatureFlag.create({ key: 'tools.lottery', enabled: true });
  await FeatureFlag.create({ key: 'tools.attendanceAttack', enabled: on });
  featureFlagService.invalidate();
}

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

async function startWorking(userId: string) {
  const checkInAt = new Date(Date.now() - 60 * 60_000);
  checkInAt.setSeconds(0, 0);
  await AttendanceRecord.create({ UserId: userId, workDate: today(), checkInAt });
}

const send = (cookie: string, body: Record<string, unknown>) =>
  request(app).post('/api/attendance/attack').set(CSRF_HEADER).set('Cookie', cookie).send(body);

const seen = (cookie: string, id: number) =>
  request(app).post(`/api/attendance/attack/${id}/seen`).set(CSRF_HEADER).set('Cookie', cookie);

const defend = (cookie: string, id: number) =>
  request(app).post(`/api/attendance/attack/${id}/defend`).set(CSRF_HEADER).set('Cookie', cookie);

const state = (cookie: string) => request(app).get('/api/attendance/attack').set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  atkCookie = await makeUser(ATK);
  tgtCookie = await makeUser(TGT);
  thirdCookie = await makeUser(THIRD);
});

beforeEach(async () => {
  await AttendanceAttack.destroy({ where: {}, truncate: true });
  await AttendanceRecord.destroy({ where: {}, truncate: true });
  await PointLedger.destroy({ where: {}, truncate: true });
  await UserPoint.destroy({ where: {}, truncate: true });
  await setFlags(true);
});

describe('쪽지 보내기', () => {
  it('쪽지 값만큼만 빠진다 — 방해보다 싸다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);

    const res = await send(atkCookie, { targetId: TGT, kind: 'popup', message: '안돼요' });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('popup');
    expect(await balanceOf(ATK)).toBe(1000 - ATTACK_RULES.popupCost);
  });

  it('받는 사람 화면에 보낸 사람과 함께 뜬다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    await send(atkCookie, { targetId: TGT, kind: 'popup', message: '퇴근 금지' });

    const res = await state(tgtCookie);
    expect(res.body.data.popup.message).toBe('퇴근 금지');
    // 누가 보냈는지 늘 함께 간다
    expect(res.body.data.popup.attackerId).toBe(ATK);
    expect(res.body.data.popup.attackerName).toBe(`${ATK}이름`);
  });

  it('긴 쪽지는 서버가 자른다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    const long = '가'.repeat(200);

    // 스키마가 먼저 막는다 — 잘라서 통과시키지 않는다
    const res = await send(atkCookie, { targetId: TGT, kind: 'popup', message: long });
    expect(res.status).toBe(400);
    expect(await balanceOf(ATK)).toBe(1000);
  });

  it('빈 쪽지에는 기본 문구가 들어간다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    await send(atkCookie, { targetId: TGT, kind: 'popup', message: '   ' });

    const res = await state(tgtCookie);
    expect(res.body.data.popup.message).toBeTruthy();
  });

  it('쪽지는 겹쳐 보낼 수 있다 — 방해와 달리 한 번 뜨고 만다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);

    expect((await send(atkCookie, { targetId: TGT, kind: 'popup', message: '하나' })).status).toBe(
      200
    );
    expect((await send(atkCookie, { targetId: TGT, kind: 'popup', message: '둘' })).status).toBe(
      200
    );
    expect(await AttendanceAttack.count({ where: { kind: 'popup' } })).toBe(2);
  });

  it('하루 한도는 방해와 쪽지를 합쳐서 센다', async () => {
    await grant(ATK, 100_000);
    await startWorking(TGT);
    for (let i = 0; i < ATTACK_RULES.dailyLimitPerAttacker; i++) {
      await AttendanceAttack.create({
        attackerId: ATK,
        targetId: THIRD,
        workDate: today(),
        kind: 'popup',
        expiresAt: new Date(Date.now() - 1000),
      });
    }
    const res = await send(atkCookie, { targetId: TGT, kind: 'popup', message: '한 장 더' });
    expect(res.status).toBe(429);
  });
});

describe('쪽지 닫기', () => {
  it('한 번 본 쪽지는 다시 뜨지 않는다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    const made = await send(atkCookie, { targetId: TGT, kind: 'popup', message: '야근해' });
    const id = made.body.data.id;

    expect((await seen(tgtCookie, id)).status).toBe(200);
    const after = await state(tgtCookie);
    expect(after.body.data.popup).toBeNull();
  });

  it('두 번 닫아도 조용히 넘어간다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    const made = await send(atkCookie, { targetId: TGT, kind: 'popup', message: '야근해' });
    const id = made.body.data.id;

    expect((await seen(tgtCookie, id)).status).toBe(200);
    expect((await seen(tgtCookie, id)).status).toBe(200);
  });

  it('남에게 온 쪽지를 대신 닫을 수 없다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    const made = await send(atkCookie, { targetId: TGT, kind: 'popup', message: '야근해' });

    expect((await seen(thirdCookie, made.body.data.id)).status).toBe(403);
  });

  it('쪽지는 방어권으로 막을 수 없다 — 이미 뜬 것이다', async () => {
    await grant(ATK, 1000);
    await grant(TGT, 1000);
    await startWorking(TGT);
    const made = await send(atkCookie, { targetId: TGT, kind: 'popup', message: '야근해' });

    const res = await defend(tgtCookie, made.body.data.id);
    expect(res.status).toBe(400);
    // 막지 못했으면 값도 치르지 않는다
    expect(await balanceOf(TGT)).toBe(1000);
  });
});

describe('방해와 쪽지는 서로 다른 칸이다', () => {
  it('쪽지가 있어도 방해를 걸 수 있다', async () => {
    await grant(ATK, 5000);
    await startWorking(TGT);
    await send(atkCookie, { targetId: TGT, kind: 'popup', message: '쪽지' });

    const res = await send(atkCookie, { targetId: TGT, kind: 'chaos' });
    expect(res.status).toBe(200);

    const board = await state(tgtCookie);
    expect(board.body.data.incoming).not.toBeNull();
    expect(board.body.data.popup).not.toBeNull();
  });

  it('종류를 안 주면 방해로 본다 — 예전 호출과 같게 동작한다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);

    const res = await send(atkCookie, { targetId: TGT });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('chaos');
    expect(await balanceOf(ATK)).toBe(1000 - ATTACK_RULES.cost);
  });
});
