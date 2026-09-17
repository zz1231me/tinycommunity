// server/src/__tests__/attendanceEdges.test.ts
// 출퇴근의 경계 상황. 날짜가 걸린 계산은 눈으로 읽어서는 틀린 곳을 못 찾는다.

import { seedTestData } from './helpers';
import { attendanceService } from '../services/attendance.service';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { User } from '../models/User';

const UID = 'edgeuser';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayStr = () => ymd(new Date());
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));

beforeAll(async () => {
  await seedTestData();
  if (!(await User.findByPk(UID))) {
    await User.create({
      id: UID,
      password: 'TestUser123!',
      name: '경계',
      email: 'edge@test.com',
      roleId: 'user',
      isActive: true,
    });
  }
});

beforeEach(async () => {
  await AttendanceRecord.destroy({ where: { UserId: UID }, force: true });
});

describe('자정을 넘긴 퇴근', () => {
  it('어제 찍고 안 닫힌 건을 오늘 퇴근으로 닫는다', async () => {
    const start = new Date(Date.now() - 10 * 3600_000); // 10시간 전
    await AttendanceRecord.create({
      UserId: UID,
      workDate: daysAgo(1),
      checkInAt: start,
      checklist: '[]',
    });

    const closed = await attendanceService.checkOut(UID);
    expect(closed.workDate).toBe(daysAgo(1));
    expect(closed.checkOutAt).not.toBeNull();
    // 10시간 = 600분. 초 단위 오차만 허용한다.
    expect(closed.workMinutes).toBeGreaterThanOrEqual(599);
    expect(closed.workMinutes).toBeLessThanOrEqual(601);
  });

  it('이틀 전 열린 기록은 건드리지 않는다 — 엉뚱한 시각으로 마감되면 안 된다', async () => {
    await AttendanceRecord.create({
      UserId: UID,
      workDate: daysAgo(2),
      checkInAt: new Date(Date.now() - 50 * 3600_000),
      checklist: '[]',
    });
    await expect(attendanceService.checkOut(UID)).rejects.toThrow();
    const row = await AttendanceRecord.findOne({ where: { UserId: UID, workDate: daysAgo(2) } });
    expect(row?.checkOutAt ?? null).toBeNull();
  });

  it('퇴근을 두 번 눌러도 시각이 덮어써지지 않는다', async () => {
    await attendanceService.checkIn(UID, { responses: [] });
    const first = await attendanceService.checkOut(UID);
    await expect(attendanceService.checkOut(UID)).rejects.toThrow();
    const row = await AttendanceRecord.findOne({ where: { UserId: UID, workDate: todayStr() } });
    expect(row?.checkOutAt?.toISOString()).toBe(new Date(first.checkOutAt!).toISOString());
  });
});

describe('하루 한 건', () => {
  it('같은 날 두 번 출근할 수 없다', async () => {
    await attendanceService.checkIn(UID, { responses: [] });
    await expect(attendanceService.checkIn(UID, { responses: [] })).rejects.toThrow();
    expect(await AttendanceRecord.count({ where: { UserId: UID } })).toBe(1);
  });

  it('동시에 두 번 눌러도 한 건만 남는다', async () => {
    const results = await Promise.allSettled([
      attendanceService.checkIn(UID, { responses: [] }),
      attendanceService.checkIn(UID, { responses: [] }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await AttendanceRecord.count({ where: { UserId: UID } })).toBe(1);
  });
});

describe('집계', () => {
  it('퇴근 안 찍은 날은 평균에서 빠지고 openDays 로 센다', async () => {
    await AttendanceRecord.create({
      UserId: UID,
      workDate: daysAgo(3),
      checkInAt: new Date(),
      checkOutAt: new Date(),
      workMinutes: 480,
      checklist: '[]',
    });
    await AttendanceRecord.create({
      UserId: UID,
      workDate: daysAgo(2),
      checkInAt: new Date(),
      checklist: '[]',
    });

    const rows = await attendanceService.listSummary({ from: daysAgo(5), to: todayStr() });
    const mine = rows.find(r => r.userId === UID)!;
    expect(mine.days).toBe(2);
    expect(mine.openDays).toBe(1);
    expect(mine.averageMinutes).toBe(480); // 열린 날을 섞으면 240 으로 내려간다
    expect(mine.totalMinutes).toBe(480);
  });
});

describe('한 사람 기록 조회', () => {
  it('기간이 길어도 한 번에 다 온다 — 그래프가 잘리지 않아야 한다', async () => {
    for (let i = 1; i <= 40; i++) {
      await AttendanceRecord.create({
        UserId: UID,
        workDate: daysAgo(i),
        checkInAt: new Date(),
        checkOutAt: new Date(),
        workMinutes: 400 + i,
        checklist: '[]',
      });
    }
    const page = await attendanceService.listRecords({
      userId: UID,
      from: daysAgo(60),
      to: todayStr(),
      limit: 366,
    });
    expect(page.records).toHaveLength(40);
    expect(page.totalPages).toBe(1);
  });

  it('전체 인원 조회는 한 번에 100 건까지만 준다', async () => {
    const page = await attendanceService.listRecords({
      from: daysAgo(60),
      to: todayStr(),
      limit: 366,
    });
    expect(page.records.length).toBeLessThanOrEqual(100);
  });
});
