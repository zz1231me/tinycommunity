import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { AttendancePolicy } from '../models/AttendancePolicy';
import { attendanceService } from '../services/attendance.service';

// 출근 시각 보정.
//
// 자리에 앉아 컴퓨터를 켜는 시간을 인정해 출근을 몇 분 앞당겨 기록한다.
// 근무 기록을 바꾸는 값이라 두 가지를 고정한다:
//   1) 기본은 0 이다 — 배포만으로 모두의 출근 시각이 조용히 당겨지면 안 된다
//   2) 근무일은 '누른 순간' 으로 정한다 — 보정 때문에 어제로 넘어가면 안 된다

let cookie: string;
const U = 'graceuser';

async function setGrace(minutes: number) {
  const policy = await attendanceService.getPolicy();
  policy.checkInGraceMinutes = minutes;
  policy.requireChecklist = false;
  await policy.save();
}

/**
 * 그 시각에 실제로 당겨질 수 있는 분.
 * 보정은 자정을 넘겨 당기지 않는다(전날로 넘어가면 없던 밤샘 근무가 생긴다).
 * 자정 직후에 돌리면 그만큼만 당겨지므로, 기대값도 같은 규칙으로 잡아야 한다.
 */
function expectedShift(graceMinutes: number): number {
  const now = new Date();
  const sinceMidnight = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return Math.min(graceMinutes, sinceMidnight);
}

const checkIn = () =>
  request(app).post('/api/attendance/check-in').set(CSRF_HEADER).set('Cookie', cookie).send({});

beforeAll(async () => {
  await seedTestData();
  if (!(await User.findByPk(U))) {
    await User.create({
      id: U,
      password: 'Test1234!',
      name: '보정유저',
      email: `${U}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
  cookie = await loginAs(U, 'Test1234!');
});

beforeEach(async () => {
  await AttendanceRecord.destroy({ where: {}, truncate: true });
  await setGrace(0);
});

describe('출근 시각 보정', () => {
  it('기본값은 0 — 누른 그대로 기록된다', async () => {
    const policy = await AttendancePolicy.findByPk(1);
    // 설정 자체의 기본값이 0 인지 (위 setGrace 와 별개로 컬럼 기본값을 본다)
    expect(policy?.checkInGraceMinutes).toBe(0);

    const before = Date.now();
    expect((await checkIn()).status).toBe(201);

    const row = await AttendanceRecord.findOne({ where: { UserId: U } });
    // 초만 절삭되므로 1분 이상 차이 나면 안 된다
    expect(before - row!.checkInAt.getTime()).toBeLessThan(60_000);
  });

  it('보정을 켜면 그만큼 앞당겨 기록된다', async () => {
    await setGrace(5);
    const before = Date.now();
    expect((await checkIn()).status).toBe(201);

    const row = await AttendanceRecord.findOne({ where: { UserId: U } });
    const shifted = (before - row!.checkInAt.getTime()) / 60_000;
    // 당겨진 만큼 + 초 절삭(최대 1분)
    const want = expectedShift(5);
    expect(shifted).toBeGreaterThanOrEqual(want - 0.02);
    expect(shifted).toBeLessThan(want + 1);
  });

  it('보정해도 초는 00 으로 남는다', async () => {
    await setGrace(3);
    await checkIn();
    const row = await AttendanceRecord.findOne({ where: { UserId: U } });
    expect(row?.checkInAt.getSeconds()).toBe(0);
    expect(row?.checkInAt.getMilliseconds()).toBe(0);
  });

  it('근무일은 누른 순간으로 정해진다 — 보정이 어제로 넘기지 않는다', async () => {
    await setGrace(60);
    await checkIn();

    const row = await AttendanceRecord.findOne({ where: { UserId: U } });
    const pressedDay = new Date();
    const expected = `${pressedDay.getFullYear()}-${String(pressedDay.getMonth() + 1).padStart(2, '0')}-${String(pressedDay.getDate()).padStart(2, '0')}`;
    expect(row?.workDate).toBe(expected);

    // 보정된 시각도 그 날 안에 있어야 한다 (자정 아래로 내려가지 않는다)
    const midnight = new Date(`${expected}T00:00:00`).getTime();
    expect(row!.checkInAt.getTime()).toBeGreaterThanOrEqual(midnight);
  });
});

describe('보정값 검증', () => {
  it('0~60 밖의 값은 거절한다', async () => {
    await expect(attendanceService.updatePolicy({ checkInGraceMinutes: -1 })).rejects.toThrow();
    await expect(attendanceService.updatePolicy({ checkInGraceMinutes: 61 })).rejects.toThrow();
    await expect(attendanceService.updatePolicy({ checkInGraceMinutes: 1.5 })).rejects.toThrow();
  });

  it('0~60 안의 값은 저장된다', async () => {
    const saved = await attendanceService.updatePolicy({ checkInGraceMinutes: 10 });
    expect(saved.checkInGraceMinutes).toBe(10);
  });
});

describe('관리자 화면에서 바꾼 보정값 — 실제 HTTP 경로', () => {
  // 위 테스트들은 보정값을 모델이나 서비스에 직접 넣는다. 그래서 관리자가 실제로 쓰는
  // 길(입력 검증 → 컨트롤러 → 서비스)이 보정값을 버리고 있어도 모두 초록이었다.
  // 스키마가 모르는 키를 걷어냈고, 컨트롤러는 세 필드만 골라 넘기고, 설정 조회도 세
  // 필드만 돌려줬다 — 관리자 화면에서는 입력칸이 늘 비어 보였고 저장도 되지 않았다.
  let adminCookie: string;
  beforeAll(async () => {
    adminCookie = await loginAs('admin', 'TestAdmin123!');
  });

  const savePolicy = (body: Record<string, unknown>) =>
    request(app)
      .put('/api/admin/attendance/policy')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send(body);
  const readSettings = () =>
    request(app).get('/api/admin/attendance/settings').set('Cookie', adminCookie);

  it('저장된다', async () => {
    const res = await savePolicy({ checkInGraceMinutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.checkInGraceMinutes).toBe(10);
    expect((await AttendancePolicy.findByPk(1))?.checkInGraceMinutes).toBe(10);
  });

  it('설정 화면이 다시 읽을 때 그 값이 보인다', async () => {
    await savePolicy({ checkInGraceMinutes: 15 });
    const res = await readSettings();
    expect(res.status).toBe(200);
    expect(res.body.data.policy.checkInGraceMinutes).toBe(15);
  });

  it('관리자가 넣은 값이 실제 출근 기록에 적용된다', async () => {
    await savePolicy({ checkInGraceMinutes: 10 });
    const before = Date.now();
    expect((await checkIn()).status).toBe(201);

    const row = await AttendanceRecord.findOne({ where: { UserId: U } });
    const shifted = (before - row!.checkInAt.getTime()) / 60_000;
    const want = expectedShift(10);
    expect(shifted).toBeGreaterThanOrEqual(want - 0.02);
    expect(shifted).toBeLessThan(want + 1);
  });

  it('범위 밖의 값은 거절하고 저장하지 않는다', async () => {
    await savePolicy({ checkInGraceMinutes: 10 });
    for (const bad of [-1, 61, 1.5]) {
      expect((await savePolicy({ checkInGraceMinutes: bad })).status).toBe(400);
    }
    expect((await AttendancePolicy.findByPk(1))?.checkInGraceMinutes).toBe(10);
  });

  it('다른 설정을 바꿔도 보정값은 그대로다', async () => {
    // 부분 저장이다. 한 칸을 바꿀 때 나머지가 기본값으로 덮이면 안 된다.
    await savePolicy({ checkInGraceMinutes: 10 });
    const policy = await AttendancePolicy.findByPk(1);
    const standard = policy!.standardWorkMinutes;

    await savePolicy({ standardWorkMinutes: standard === 500 ? 480 : 500 });
    expect((await AttendancePolicy.findByPk(1))?.checkInGraceMinutes).toBe(10);

    await savePolicy({ standardWorkMinutes: standard });
  });
});
