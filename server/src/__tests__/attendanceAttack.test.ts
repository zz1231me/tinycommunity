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
import { ATTACK_DEFAULTS } from '../config/attendanceAttack';

// 퇴근 공격권·방어권.
//
// 이 스위트가 지키는 가장 중요한 것은 맨 아래 '기록은 건드리지 않는다' 다.
// 공격은 화면의 버튼만 잠근다 — 서버의 퇴근 기록은 이 기능을 쳐다보지도 않는다.
// 남이 내 근무 기록의 시각을 늦출 수 있게 되는 순간 이건 장난이 아니게 된다.

let atkCookie: string;
let tgtCookie: string;
let thirdCookie: string;
const ATK = 'atkalpha';
const TGT = 'atktarget';
const THIRD = 'atkthird';

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

async function setFlags(attackOn: boolean) {
  for (const key of ['tools.attendance', 'tools.lottery', 'tools.attendanceAttack']) {
    await FeatureFlag.destroy({ where: { key } });
  }
  await FeatureFlag.create({ key: 'tools.attendance', enabled: true });
  await FeatureFlag.create({ key: 'tools.lottery', enabled: true });
  await FeatureFlag.create({ key: 'tools.attendanceAttack', enabled: attackOn });
  featureFlagService.invalidate();
}

/** 원장에 근거를 남기면서 포인트를 쥐어 준다 */
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

/**
 * 근무 중으로 만든다 — 퇴근을 앞둔 사람에게만 쓸 수 있는 기능이다.
 *
 * 출근 시각의 초를 미리 떨어뜨려 둔다. 퇴근은 분 단위로 절삭해 기록되므로(atMinute),
 * 출근 쪽에만 초가 남아 있으면 두 시각의 차이가 59분 몇 초가 되어 근무 시간이
 * 실행할 때마다 59분과 60분 사이를 오간다 — 코드가 아니라 테스트가 흔들린다.
 */
async function startWorking(userId: string) {
  const checkInAt = new Date(Date.now() - 60 * 60_000);
  checkInAt.setSeconds(0, 0);
  await AttendanceRecord.create({
    UserId: userId,
    workDate: today(),
    checkInAt,
  });
}

/** kind 를 주지 않으면 서버 기본값(chaos)으로 간다 — 기존 호출들이 그대로 동작한다 */
const attack = (cookie: string, targetId: string, kind?: 'chaos' | 'hide') =>
  request(app)
    .post('/api/attendance/attack')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(kind ? { targetId, kind } : { targetId });

const defend = (cookie: string, id: number) =>
  request(app).post(`/api/attendance/attack/${id}/defend`).set(CSRF_HEADER).set('Cookie', cookie);

const state = (cookie: string) => request(app).get('/api/attendance/attack').set('Cookie', cookie);

const checkOut = (cookie: string) =>
  request(app).post('/api/attendance/check-out').set(CSRF_HEADER).set('Cookie', cookie);

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

describe('공격권 사용', () => {
  it('포인트를 치르고 상대에게 걸린다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);

    const res = await attack(atkCookie, TGT);
    expect(res.status).toBe(200);
    expect(await balanceOf(ATK)).toBe(1000 - ATTACK_DEFAULTS.cost);
    await expectLedgerConsistent(ATK);

    const seen = await state(tgtCookie);
    expect(seen.body.data.incoming).not.toBeNull();
    expect(seen.body.data.incoming.attackerId).toBe(ATK);
  });

  it('근무 중이 아닌 사람에게는 쓸 수 없다', async () => {
    await grant(ATK, 1000);
    // 출근 기록 없음
    const res = await attack(atkCookie, TGT);
    expect(res.status).toBe(400);
    expect(await balanceOf(ATK)).toBe(1000);
  });

  it('자기 자신에게는 쓸 수 없다', async () => {
    await grant(ATK, 1000);
    await startWorking(ATK);
    const res = await attack(atkCookie, ATK);
    expect(res.status).toBe(400);
    expect(await balanceOf(ATK)).toBe(1000);
  });

  it('포인트가 모자라면 걸리지 않는다', async () => {
    await grant(ATK, 10);
    await startWorking(TGT);
    const res = await attack(atkCookie, TGT);
    expect(res.status).toBe(400);
    expect(await AttendanceAttack.count()).toBe(0);
  });

  it('이미 공격받는 사람에게 겹쳐 쓸 수 없다', async () => {
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await startWorking(TGT);

    expect((await attack(atkCookie, TGT)).status).toBe(200);
    const second = await attack(thirdCookie, TGT);
    expect(second.status).toBe(409);
    // 막힌 공격으로 포인트가 빠지면 안 된다
    expect(await balanceOf(THIRD)).toBe(5000);
  });

  it('종류가 달라도 겹쳐 쓸 수 없다', async () => {
    // 겹침 확인이 chaos 행만 세던 때가 있었다. 그때는 숨기기가 걸려 있어도 그 행이
    // 세어지지 않아 그 위에 방해를 덧걸 수 있었고, 받는 쪽은 하나를 풀어도 다음 것이
    // 남아 방어권 값을 두 번 치러야 했다.
    //
    // 숨기기를 '먼저' 거는 순서여야 한다. chaos 를 먼저 걸면 낡은 코드에서도 그 행이
    // 세어져 막히므로, 순서를 뒤집으면 아무것도 가려내지 못하는 검사가 된다.
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await startWorking(TGT);

    expect((await attack(atkCookie, TGT, 'hide')).status).toBe(200);
    const second = await attack(thirdCookie, TGT, 'chaos');
    expect(second.status).toBe(409);
    expect(await balanceOf(THIRD)).toBe(5000);
  });

  it('걸린 공격의 종류를 함께 알려 준다', async () => {
    // 받는 화면은 이 값 하나로 '버튼을 흔들지, 감출지' 를 고른다.
    // 빠지거나 늘 chaos 로 오면, 숨기기를 받은 사람의 화면에서는 버튼이 그냥 흔들린다.
    await grant(ATK, 5000);
    await startWorking(TGT);

    await attack(atkCookie, TGT, 'hide');

    const seen = await state(tgtCookie);
    expect(seen.body.data.incoming.kind).toBe('hide');
  });

  it('하루 한도를 넘겨 쓸 수 없다', async () => {
    await grant(ATK, 100_000);
    // 한도만큼 이미 쓴 것으로 둔다 (대상은 서로 달라도 한도는 쓴 사람 기준이다)
    for (let i = 0; i < ATTACK_DEFAULTS.dailyLimitPerAttacker; i++) {
      await AttendanceAttack.create({
        attackerId: ATK,
        targetId: THIRD,
        workDate: today(),
        expiresAt: new Date(Date.now() - 1000),
      });
    }
    await startWorking(TGT);

    const res = await attack(atkCookie, TGT);
    expect(res.status).toBe(429);
    expect(await balanceOf(ATK)).toBe(100_000);
  });
});

describe('방어권', () => {
  it('값을 치르면 공격이 풀린다', async () => {
    await grant(ATK, 1000);
    await grant(TGT, 1000);
    await startWorking(TGT);
    const made = await attack(atkCookie, TGT);

    const res = await defend(tgtCookie, made.body.data.id);
    expect(res.status).toBe(200);
    expect(await balanceOf(TGT)).toBe(1000 - ATTACK_DEFAULTS.defendCost);
    await expectLedgerConsistent(TGT);

    const seen = await state(tgtCookie);
    expect(seen.body.data.incoming).toBeNull();
  });

  it('숨기기도 방어권으로 풀린다', async () => {
    // 예전에는 chaos 가 아닌 공격을 방어하려 하면 거절했다 — 쪽지는 이미 뜬 것이라
    // 되돌릴 것이 없었기 때문이다. 숨기기는 되돌릴 것이 있으므로 그 거절을 걷어 냈다.
    // 풀 수 없는 숨기기는 '기다리는 수밖에 없는' 공격이 된다.
    await grant(ATK, 1000);
    await grant(TGT, 1000);
    await startWorking(TGT);
    const made = await attack(atkCookie, TGT, 'hide');

    const res = await defend(tgtCookie, made.body.data.id);
    expect(res.status).toBe(200);
    expect(await balanceOf(TGT)).toBe(1000 - ATTACK_DEFAULTS.defendCost);

    const seen = await state(tgtCookie);
    expect(seen.body.data.incoming).toBeNull();
  });

  it('남에게 걸린 공격은 방어할 수 없다', async () => {
    await grant(ATK, 1000);
    await grant(THIRD, 1000);
    await startWorking(TGT);
    const made = await attack(atkCookie, TGT);

    const res = await defend(thirdCookie, made.body.data.id);
    expect(res.status).toBe(403);
    expect(await balanceOf(THIRD)).toBe(1000);
  });

  it('두 번 방어해도 값은 한 번만 치른다', async () => {
    await grant(ATK, 1000);
    await grant(TGT, 1000);
    await startWorking(TGT);
    const made = await attack(atkCookie, TGT);
    const id = made.body.data.id;

    expect((await defend(tgtCookie, id)).status).toBe(200);
    expect((await defend(tgtCookie, id)).status).toBe(409);
    expect(await balanceOf(TGT)).toBe(1000 - ATTACK_DEFAULTS.defendCost);
    await expectLedgerConsistent(TGT);
  });

  it('동시에 눌러도 한 번만 치른다', async () => {
    await grant(ATK, 1000);
    await grant(TGT, 1000);
    await startWorking(TGT);
    const made = await attack(atkCookie, TGT);
    const id = made.body.data.id;

    const results = await Promise.all([
      defend(tgtCookie, id),
      defend(tgtCookie, id),
      defend(tgtCookie, id),
    ]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(await balanceOf(TGT)).toBe(1000 - ATTACK_DEFAULTS.defendCost);
    await expectLedgerConsistent(TGT);
  });
});

describe('기록은 건드리지 않는다', () => {
  it('공격을 받는 중에도 퇴근은 누른 그 순간으로 기록된다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    const made = await attack(atkCookie, TGT);

    // 공격이 아직 살아 있는 상태에서 퇴근을 누른다
    const live = await AttendanceAttack.findByPk(made.body.data.id);
    expect(live?.defendedAt).toBeNull();
    expect(live!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const pressedAt = Date.now();
    const res = await checkOut(tgtCookie);

    // 서버는 공격을 이유로 퇴근을 막지 않는다
    expect(res.status).toBe(200);

    const row = await AttendanceRecord.findOne({ where: { UserId: TGT } });
    expect(row?.checkOutAt).not.toBeNull();
    // 초 단위 절삭(atMinute) 때문에 최대 1분 이르게 찍힐 수 있다 — 그 이상 밀리면 안 된다
    const drift = Math.abs(row!.checkOutAt!.getTime() - pressedAt);
    expect(drift).toBeLessThan(120_000);
  });

  it('방어하지 않고 두어도 퇴근 기록에는 아무 흔적이 없다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    await attack(atkCookie, TGT);

    await checkOut(tgtCookie);
    const row = await AttendanceRecord.findOne({ where: { UserId: TGT } });
    expect(row?.checkOutAt).not.toBeNull();
    // 출근·퇴근 모두 분 단위라 차이는 정확히 60분이다. 공격이 깎지도 늘리지도 않는다.
    expect(row!.checkOutAt!.getTime() - row!.checkInAt.getTime()).toBe(60 * 60_000);
    expect(row?.workMinutes).toBe(60);
  });
});

describe('기능 스위치', () => {
  it('꺼져 있으면 화면에서 숨기는 것과 별개로 API 가 막힌다', async () => {
    await setFlags(false);
    await grant(ATK, 1000);
    await startWorking(TGT);

    expect((await state(atkCookie)).status).toBe(403);
    expect((await attack(atkCookie, TGT)).status).toBe(403);
    expect(await balanceOf(ATK)).toBe(1000);
  });

  it('꺼져 있어도 퇴근은 정상으로 기록된다', async () => {
    await setFlags(false);
    await startWorking(TGT);
    expect((await checkOut(tgtCookie)).status).toBe(200);
  });
});

describe('언제 근무 중으로 보는가', () => {
  it('며칠 전 안 닫힌 기록으로는 공격 대상이 되지 않는다', async () => {
    // 퇴근을 한 번 깜빡하면 그 기록은 영영 닫히지 않는다 — checkOut 은 오늘 것이거나
    // 자정을 넘긴 어제 것만 닫는다. 근무일을 묶지 않으면 그 사람은 그날 이후로
    // 새벽이든 주말이든 24시간 내내 공격받을 수 있다.
    await grant(ATK, 5000);
    const stale = new Date(Date.now() - 3 * 86_400_000);
    stale.setSeconds(0, 0);
    await AttendanceRecord.create({ UserId: TGT, workDate: today(stale), checkInAt: stale });

    const res = await attack(atkCookie, TGT);
    expect(res.status).toBe(400);
    // 거절당한 공격으로 포인트가 빠지면 안 된다
    expect(await balanceOf(ATK)).toBe(5000);
  });

  it('오늘 출근했으면 공격 대상이 된다', async () => {
    await grant(ATK, 5000);
    await startWorking(TGT);
    expect((await attack(atkCookie, TGT)).status).toBe(200);
  });
});

describe('동시에 걸어도 방해는 하나만 산다', () => {
  it('둘이 같은 순간에 걸면 하나만 통과한다', async () => {
    // 겹침 확인이 트랜잭션 밖에 있으면 둘 다 통과해 살아 있는 방해가 둘이 된다.
    // 그러면 받는 쪽은 하나를 풀어도 곧바로 다음 것이 떠서 방어권 값을 두 번 낸다.
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await startWorking(TGT);

    const results = await Promise.all([attack(atkCookie, TGT), attack(thirdCookie, TGT)]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);

    const live = await AttendanceAttack.count({
      where: { targetId: TGT, kind: 'chaos', defendedAt: null },
    });
    expect(live).toBe(1);
  });

  it('한 번 방어하면 나에게 걸린 방해가 남지 않는다', async () => {
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await grant(TGT, 5000);
    await startWorking(TGT);

    const results = await Promise.all([attack(atkCookie, TGT), attack(thirdCookie, TGT)]);
    const made = results.find(r => r.status === 200)!;

    expect((await defend(tgtCookie, made.body.data.id)).status).toBe(200);

    // 값은 한 번만 치르고, 살아 있는 방해는 하나도 남지 않아야 한다
    expect(await balanceOf(TGT)).toBe(5000 - ATTACK_DEFAULTS.defendCost);
    const seen = await state(tgtCookie);
    expect(seen.body.data.incoming).toBeNull();
  });
});
