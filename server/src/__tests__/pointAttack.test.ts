import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';
import { PointLedger } from '../models/PointLedger';
import { PointAttack } from '../models/PointAttack';
import { AttendanceAttack } from '../models/AttendanceAttack';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { pointAttackService } from '../services/pointAttack.service';
import { today } from '../services/point.service';
import { HALVE_COST, HALVE_SUCCESS_PERCENT } from '../config/pointAttack';
import { ATTACK_DEFAULTS } from '../config/attendanceAttack';
import { Notification } from '../models/Notification';

// 포인트 절반 날리기.
//
// 이 스위트가 지키는 두 가지.
//  1) 익명 — 당한 사람이 닿을 수 있는 어디에도(응답·알림·원장) 공격자의 흔적이 없어야 한다.
//     이름이 새는 순간 이 기능은 사내에서 쓸 수 없는 것이 된다.
//  2) 포인트는 사라질 뿐 옮겨지지 않는다. 공격자가 이득을 보면 서로 털어 주는 짓이 된다.

let atkCookie: string;
let tgtCookie: string;
const ATK = 'halveatk';
const TGT = 'halvetgt';

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

async function setFlags(halveOn: boolean) {
  for (const key of ['tools.lottery', 'tools.pointAttack']) {
    await FeatureFlag.destroy({ where: { key } });
  }
  await FeatureFlag.create({ key: 'tools.lottery', enabled: true });
  await FeatureFlag.create({ key: 'tools.pointAttack', enabled: halveOn });
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

async function expectLedgerConsistent(userId: string) {
  const sum = (await PointLedger.sum('amount', { where: { UserId: userId } })) || 0;
  expect(await balanceOf(userId)).toBe(sum);
}

const throwAt = (cookie: string, targetId: string) =>
  request(app)
    .post('/api/points/attack/halve')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ targetId });

const state = (cookie: string) => request(app).get('/api/points/attack').set('Cookie', cookie);

/** 알림은 정산과 묶지 않고 뒤따라 만들어진다 — 잠깐 기다린다 */
async function waitForNotice(userId: string) {
  for (let i = 0; i < 20; i += 1) {
    const row = await Notification.findOne({ where: { userId, type: 'ATTACK' } });
    if (row) return row;
    await new Promise(r => setTimeout(r, 25));
  }
  return null;
}

/** 반드시 맞는 주사위 / 반드시 빗나가는 주사위 */
const always = () => HALVE_SUCCESS_PERCENT;
const never = () => 100;

beforeAll(async () => {
  await seedTestData();
  atkCookie = await makeUser(ATK);
  tgtCookie = await makeUser(TGT);
});

beforeEach(async () => {
  await setFlags(true);
  await PointAttack.destroy({ where: {} });
  await AttendanceAttack.destroy({ where: {} });
  await Notification.destroy({ where: {} });
  await grant(ATK, 10_000);
  await grant(TGT, 2_468);
});

describe('포인트 절반 날리기', () => {
  it('통하면 상대의 절반이 사라진다 — 공격자에게 오지 않는다', async () => {
    const before = await balanceOf(ATK);
    const result = await pointAttackService.halve(ATK, { targetId: TGT }, always);

    expect(result.succeeded).toBe(true);
    expect(result.lost).toBe(1234); // 2,468 의 절반
    expect(await balanceOf(TGT)).toBe(1234);
    // 공격자는 값만 냈다. 날린 몫은 어디로도 가지 않는다.
    expect(await balanceOf(ATK)).toBe(before - HALVE_COST);
    await expectLedgerConsistent(ATK);
    await expectLedgerConsistent(TGT);
  });

  it('빗나가도 값은 돌려주지 않는다', async () => {
    const result = await pointAttackService.halve(ATK, { targetId: TGT }, never);

    expect(result.succeeded).toBe(false);
    expect(result.lost).toBe(0);
    expect(await balanceOf(TGT)).toBe(2_468);
    expect(await balanceOf(ATK)).toBe(10_000 - HALVE_COST);
  });

  it('홀수는 버림이라 상대에게 1P 유리하다', async () => {
    await grant(TGT, 777);
    const result = await pointAttackService.halve(ATK, { targetId: TGT }, always);
    expect(result.lost).toBe(388);
    expect(await balanceOf(TGT)).toBe(389);
  });

  it('상대에게 포인트가 없으면 날릴 것도 없다 — 원장에 0원 줄을 남기지 않는다', async () => {
    await grant(TGT, 0);
    await PointLedger.destroy({ where: { UserId: TGT } });
    const result = await pointAttackService.halve(ATK, { targetId: TGT }, always);

    expect(result.succeeded).toBe(true);
    expect(result.lost).toBe(0);
    expect(await PointLedger.count({ where: { UserId: TGT } })).toBe(0);
  });

  it('포인트가 모자라면 던질 수 없다', async () => {
    await grant(ATK, HALVE_COST - 1);
    await expect(pointAttackService.halve(ATK, { targetId: TGT }, always)).rejects.toThrow(
      /모자랍니다/
    );
    expect(await balanceOf(TGT)).toBe(2_468);
    expect(await PointAttack.count()).toBe(0);
  });

  it('자기 자신에게는 쓸 수 없다', async () => {
    await expect(pointAttackService.halve(ATK, { targetId: ATK }, always)).rejects.toThrow(
      /자기 자신/
    );
  });
});

describe('익명', () => {
  it('응답에 공격자의 흔적이 없다', async () => {
    const res = await throwAt(atkCookie, TGT);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(ATK);
    expect(body).not.toContain(`${ATK}이름`);
  });

  it('응답에 사라진 액수도 없다 — 절반을 알면 상대의 잔액을 아는 것과 같다', async () => {
    const res = await throwAt(atkCookie, TGT);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('lost');
    expect(res.body.data).not.toHaveProperty('amountLost');
    // 상대의 잔액(2,468)이나 그 절반(1,234)이 어떤 형태로도 실려 있으면 안 된다
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('2468');
    expect(body).not.toContain('1234');
  });

  it('당한 사람의 알림과 원장에도 공격자가 없다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, always);

    const note = await waitForNotice(TGT);
    expect(note).not.toBeNull();
    expect(note!.message).toContain('누군가');
    expect(note!.message).not.toContain(ATK);
    expect(note!.message).not.toContain(`${ATK}이름`);

    const entry = await PointLedger.findOne({
      where: { UserId: TGT, reason: 'point_attack_loss' },
    });
    expect(entry).not.toBeNull();
    expect(entry!.memo ?? '').not.toContain(ATK);
    expect(entry!.memo ?? '').not.toContain(`${ATK}이름`);
  });

  it('그래도 서버 기록에는 남아 관리자가 누구인지 알 수 있다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, always);
    const row = await PointAttack.findOne({ where: { targetId: TGT } });
    expect(row?.attackerId).toBe(ATK);
    expect(row?.succeeded).toBe(true);
    expect(row?.amountLost).toBe(1234);
  });

  it('빗나가도 기록은 남는다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, never);
    const row = await PointAttack.findOne({ where: { targetId: TGT } });
    expect(row?.succeeded).toBe(false);
    expect(row?.amountLost).toBe(0);
    // 빗나갔으면 상대는 알 이유가 없다. 맞았을 때 알림이 도착하는 만큼 기다린 뒤에 센다.
    await new Promise(r => setTimeout(r, 200));
    expect(await Notification.count({ where: { userId: TGT } })).toBe(0);
  });
});

describe('하루 횟수는 퇴근 공격권과 함께 센다', () => {
  const limit = ATTACK_DEFAULTS.dailyLimitPerAttacker;

  it('제한을 넘기면 막는다', async () => {
    for (let i = 0; i < limit; i += 1) {
      await pointAttackService.halve(ATK, { targetId: TGT }, never);
    }
    await expect(pointAttackService.halve(ATK, { targetId: TGT }, never)).rejects.toThrow(
      /모두 사용/
    );
    expect(await PointAttack.count({ where: { attackerId: ATK } })).toBe(limit);
  });

  it('퇴근 공격을 쓴 만큼 절반 날리기도 줄어든다', async () => {
    await AttendanceAttack.create({
      attackerId: ATK,
      targetId: TGT,
      workDate: today(),
      kind: 'chaos',
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await state(atkCookie);
    expect(res.body.data.usedToday).toBe(1);
    expect(res.body.data.remainingToday).toBe(limit - 1);
  });
});

describe('기능 스위치', () => {
  it('꺼 두면 서버가 막는다 — 화면에서 감추는 것으로는 부족하다', async () => {
    await setFlags(false);
    const res = await throwAt(atkCookie, TGT);
    expect(res.status).toBe(403);
    expect(await PointAttack.count()).toBe(0);
    expect(await balanceOf(ATK)).toBe(10_000);
  });

  it('꺼 두면 상태 조회도 막힌다', async () => {
    await setFlags(false);
    expect((await state(atkCookie)).status).toBe(403);
  });
});

describe('관리자 기록 화면', () => {
  const log = (cookie: string) =>
    request(app).get('/api/admin/point-attacks').set('Cookie', cookie);

  it('관리자는 누가 걸었는지 본다 — 익명은 당한 사람에게만 지키는 규칙이다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, always);

    const adminCookie = await loginAs('admin', 'TestAdmin123!');
    const res = await log(adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    const row = res.body.data.rows[0];
    expect(row.attackerId).toBe(ATK);
    expect(row.attackerName).toBe(`${ATK}이름`);
    expect(row.targetId).toBe(TGT);
    expect(row.succeeded).toBe(true);
    expect(row.amountLost).toBe(1234);
  });

  it('빗나간 것은 보여 주지 않는다 — 99%가 빗나가 목록을 덮는다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, never);
    const adminCookie = await loginAs('admin', 'TestAdmin123!');
    const body = (await log(adminCookie)).body.data;
    expect(body.rows).toHaveLength(0);
    expect(body.total).toBe(0);
    // 행 자체는 남는다 — 필요해지면 조건만 풀면 된다
    expect(await PointAttack.count()).toBe(1);
  });

  it('최근 것이 먼저 온다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, always);
    await grant(TGT, 1000);
    await pointAttackService.halve(ATK, { targetId: TGT }, always);
    const adminCookie = await loginAs('admin', 'TestAdmin123!');
    const rows = (await log(adminCookie)).body.data.rows;
    expect(rows.map((r: { amountLost: number }) => r.amountLost)).toEqual([500, 1234]);
  });

  it('관리자가 아니면 볼 수 없다 — 여기서 새면 익명이 무너진다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, always);
    const res = await log(atkCookie);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(ATK);
  });
});

describe('확률', () => {
  it('서버가 정한다 — 요청에 성공 여부를 실어도 무시한다', async () => {
    const res = await request(app)
      .post('/api/points/attack/halve')
      .set(CSRF_HEADER)
      .set('Cookie', atkCookie)
      .send({ targetId: TGT, succeeded: true, lost: 999_999 });

    expect(res.status).toBe(200);
    const row = await PointAttack.findOne({ where: { targetId: TGT } });
    // 1% 라 거의 빗나간다. 무엇이 나오든 보낸 값과는 무관해야 한다.
    expect(row?.amountLost).not.toBe(999_999);
    expect(await balanceOf(TGT)).toBeGreaterThanOrEqual(1234);
  });

  it('1% 로 뽑는다 — 1 이면 맞고 2 이면 빗나간다', async () => {
    expect((await pointAttackService.halve(ATK, { targetId: TGT }, () => 1)).succeeded).toBe(true);
    await grant(TGT, 2_468);
    expect((await pointAttackService.halve(ATK, { targetId: TGT }, () => 2)).succeeded).toBe(false);
  });
});

describe('당한 사람이 받는 알림', () => {
  it('얼마나 잃었는지는 알려 준다', async () => {
    await pointAttackService.halve(ATK, { targetId: TGT }, always);
    const note = await waitForNotice(TGT);
    expect(note).not.toBeNull();
    expect(note!.message).toContain('1,234');
    expect(note!.message).toContain('절반');
  });
});
