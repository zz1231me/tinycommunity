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
    // 5분 당겨지고 초 절삭까지 더해 5~6분 사이
    expect(shifted).toBeGreaterThanOrEqual(5);
    expect(shifted).toBeLessThan(6);
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
