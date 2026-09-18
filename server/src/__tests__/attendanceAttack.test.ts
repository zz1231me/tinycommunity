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
import { ATTACK_DEFAULTS, ATTACK_MAX_STACK } from '../config/attendanceAttack';
import { Notification } from '../models/Notification';

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

  it('쌓인다 — 두 번째 공격은 첫 공격이 끝나면 시작한다', async () => {
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await startWorking(TGT);

    const first = await attack(atkCookie, TGT);
    const second = await attack(thirdCookie, TGT);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.stack).toBe(2);
    // 줄을 선다 — 앞 공격이 끝나는 순간 시작하고, 자기 길이만큼 간다
    expect(new Date(second.body.data.startsAt).getTime()).toBe(
      new Date(first.body.data.expiresAt).getTime()
    );
    expect(
      new Date(second.body.data.expiresAt).getTime() - new Date(second.body.data.startsAt).getTime()
    ).toBe(ATTACK_DEFAULTS.blockSeconds * 1000);
  });

  it('종류가 달라도 쌓이고, 먼저 건 것부터 걸린다', async () => {
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await startWorking(TGT);

    expect((await attack(atkCookie, TGT, 'hide')).status).toBe(200);
    expect((await attack(thirdCookie, TGT, 'chaos')).status).toBe(200);

    const seen = (await state(tgtCookie)).body.data;
    expect(seen.queue.map((q: { kind: string }) => q.kind)).toEqual(['hide', 'chaos']);
    // 지금 걸려 있는 것은 맨 앞(숨기기)이다
    expect(seen.incoming.kind).toBe('hide');
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

describe('쌓이는 공격', () => {
  /** 줄을 곧바로 채운다 — 사람마다 하루 한도가 있어 HTTP 로는 10개를 쌓기 번거롭다 */
  async function fillQueue(n: number) {
    let cursor = Date.now();
    for (let i = 0; i < n; i++) {
      await AttendanceAttack.create({
        // 공격하는 쪽(ATK)의 하루 한도를 건드리지 않게 다른 사람 이름으로 채운다
        attackerId: THIRD,
        targetId: TGT,
        workDate: today(),
        kind: 'chaos',
        startsAt: new Date(cursor),
        expiresAt: new Date(cursor + 60_000),
      });
      cursor += 60_000;
    }
  }

  it(`${ATTACK_MAX_STACK}개까지 쌓이고, 그다음은 거절한다 — 포인트도 빠지지 않는다`, async () => {
    await grant(ATK, 5000);
    await startWorking(TGT);
    await fillQueue(ATTACK_MAX_STACK - 1);

    expect((await attack(atkCookie, TGT)).status).toBe(200);
    const over = await attack(atkCookie, TGT);
    expect(over.status).toBe(409);
    expect(await balanceOf(ATK)).toBe(5000 - ATTACK_DEFAULTS.cost);
  });

  it('두 사람이 잇달아 걸어도 줄이 겹치지 않는다', async () => {
    // (SQLite 는 요청을 줄 세우므로 여기서 잠금을 검증하지는 못한다 — 이어 붙이는 계산을 본다.
    //  잠금은 대상의 잔액 행을 먼저 잡는 구조가 지킨다.)
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await startWorking(TGT);

    await Promise.all([attack(atkCookie, TGT), attack(thirdCookie, TGT)]);
    const queue = (await state(tgtCookie)).body.data.queue as Array<{
      startsAt: string;
      expiresAt: string;
    }>;
    expect(queue).toHaveLength(2);
    expect(new Date(queue[1].startsAt).getTime()).toBe(new Date(queue[0].expiresAt).getTime());
  });

  it('방어권 한 장에 맨 앞 하나만 풀리고, 다음 것이 곧바로 시작된다', async () => {
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await grant(TGT, 5000);
    await startWorking(TGT);
    const first = await attack(atkCookie, TGT);
    const second = await attack(thirdCookie, TGT);
    const plannedStart = new Date(second.body.data.startsAt).getTime();

    const res = await defend(tgtCookie, first.body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data.remaining).toBe(1);
    expect(await balanceOf(TGT)).toBe(5000 - ATTACK_DEFAULTS.defendCost);

    const seen = (await state(tgtCookie)).body.data;
    expect(seen.queue).toHaveLength(1);
    expect(seen.incoming.id).toBe(second.body.data.id);
    // 앞 공격이 원래 끝났을 시각까지 기다리지 않는다 — 지금 시작하고, 길이는 그대로다
    const start = new Date(seen.incoming.startsAt).getTime();
    expect(start).toBeLessThan(plannedStart);
    expect(Math.abs(start - Date.now())).toBeLessThan(5_000);
    expect(new Date(seen.incoming.expiresAt).getTime() - start).toBe(
      ATTACK_DEFAULTS.blockSeconds * 1000
    );
    await expectLedgerConsistent(TGT);
  });

  it('맨 앞이 아닌 공격은 방어할 수 없다 — 값도 빠지지 않는다', async () => {
    // 뒤의 것을 먼저 풀어 봐야 지금 걸린 공격은 그대로라 값만 나간다
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await grant(TGT, 5000);
    await startWorking(TGT);
    await attack(atkCookie, TGT);
    const second = await attack(thirdCookie, TGT);

    expect((await defend(tgtCookie, second.body.data.id)).status).toBe(409);
    expect(await balanceOf(TGT)).toBe(5000);
  });

  it('쌓인 수만큼 알림에 적는다', async () => {
    await grant(ATK, 5000);
    await grant(THIRD, 5000);
    await startWorking(TGT);
    await Notification.destroy({ where: {}, truncate: true });

    await attack(atkCookie, TGT);
    await attack(thirdCookie, TGT);
    let rows: Notification[] = [];
    for (let i = 0; i < 20 && rows.length < 2; i++) {
      rows = await Notification.findAll({
        where: { userId: TGT, type: 'ATTACK' },
        order: [['id', 'ASC']],
      });
      if (rows.length < 2) await new Promise(r => setTimeout(r, 25));
    }
    expect(rows[1].message).toContain('쌓인 공격 2개');
  });
});

describe('알림이 데려가는 곳', () => {
  /** 알림은 정산과 묶지 않고 뒤따라 만들어진다 — 잠깐 기다린다 */
  async function attackNotices(userId: string) {
    for (let i = 0; i < 20; i++) {
      const rows = await Notification.findAll({ where: { userId, type: 'ATTACK' } });
      if (rows.length > 0) return rows;
      await new Promise(r => setTimeout(r, 25));
    }
    return Notification.findAll({ where: { userId, type: 'ATTACK' } });
  }

  beforeEach(async () => {
    await Notification.destroy({ where: {}, truncate: true });
  });

  it('방어당한 공격자는 포인트 탭으로 간다', async () => {
    // 공격한 사람의 출근 화면에는 자기가 건 공격에 대한 것이 아무것도 없다
    await grant(ATK, 1000);
    await grant(TGT, 1000);
    await startWorking(TGT);
    const made = await attack(atkCookie, TGT);
    await defend(tgtCookie, made.body.data.id);

    const rows = await attackNotices(ATK);
    expect(rows).toHaveLength(1);
    expect(rows[0].link).toBe('/profile?tab=points');
  });

  it('공격받은 사람은 출근 화면으로 간다 — 퇴근 버튼 효과와 방어권이 거기 있다', async () => {
    await grant(ATK, 1000);
    await startWorking(TGT);
    await attack(atkCookie, TGT);

    const rows = await attackNotices(TGT);
    expect(rows).toHaveLength(1);
    expect(rows[0].link).toBe('/attendance');
  });
});

describe('어제 퇴근을 깜빡한 사람', () => {
  // 공격 대상 판정은 퇴근 버튼이 닫을 기록과 같은 기록을 본다. 예전에는 '오늘·어제 중 안
  // 닫힌 것이 하나라도 있으면' 근무 중으로 봐서, 어제 퇴근을 깜빡한 사람은 오늘 퇴근한
  // 뒤에도 하루 종일 공격 대상이었다(오늘 기록이 있으면 퇴근은 어제 것을 닫지 않는다).
  const yesterday = () => today(new Date(Date.now() - 86_400_000));

  async function openYesterday(userId: string) {
    const checkInAt = new Date(Date.now() - 26 * 60 * 60_000);
    checkInAt.setSeconds(0, 0);
    await AttendanceRecord.create({ UserId: userId, workDate: yesterday(), checkInAt });
  }

  it('오늘 퇴근까지 했으면 공격 대상이 아니다', async () => {
    await grant(ATK, 5000);
    await openYesterday(TGT);
    const checkInAt = new Date(Date.now() - 3 * 60 * 60_000);
    checkInAt.setSeconds(0, 0);
    await AttendanceRecord.create({
      UserId: TGT,
      workDate: today(),
      checkInAt,
      checkOutAt: new Date(),
      workMinutes: 180,
    });

    expect((await attack(atkCookie, TGT)).status).toBe(400);
    expect(await balanceOf(ATK)).toBe(5000);
  });

  it('오늘 출근 전이면 어제 기록이 살아 있는 동안은 근무 중이다 — 대조', async () => {
    // 자정을 넘겨 이어 일하는 중이다. 퇴근을 누르면 이 어제 기록이 닫힌다.
    await grant(ATK, 5000);
    await openYesterday(TGT);
    expect((await attack(atkCookie, TGT)).status).toBe(200);
  });
});
