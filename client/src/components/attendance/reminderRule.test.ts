// client/src/components/attendance/AttendanceReminder.test.ts
// 언제 알릴지의 규칙만 따로 고정한다.

import { describe, expect, it } from 'vitest';
import { reminderRecord, shouldNotify } from './reminderRule';
import type { AttendanceRecord } from '../../types/attendance.types';

const base = { working: true, standardWorkMinutes: 480, workedMinutes: 0, alreadyNoticed: false };

describe('퇴근 알림 시점', () => {
  it('10분 넘게 남았으면 알리지 않는다', () => {
    expect(shouldNotify({ ...base, workedMinutes: 469 })).toBe(false);
  });

  it('10분 남으면 알린다', () => {
    expect(shouldNotify({ ...base, workedMinutes: 470 })).toBe(true);
  });

  it('기준을 이미 넘겼어도 알린다 — 넘긴 줄 모르는 쪽이 더 곤란하다', () => {
    expect(shouldNotify({ ...base, workedMinutes: 600 })).toBe(true);
  });

  it('퇴근을 찍었으면 알리지 않는다', () => {
    expect(shouldNotify({ ...base, working: false, workedMinutes: 600 })).toBe(false);
  });

  it('오늘 이미 알렸으면 다시 알리지 않는다', () => {
    expect(shouldNotify({ ...base, workedMinutes: 600, alreadyNoticed: true })).toBe(false);
  });

  it('기준 시간이 없으면 알리지 않는다', () => {
    expect(shouldNotify({ ...base, standardWorkMinutes: 0, workedMinutes: 600 })).toBe(false);
  });
});

describe('무엇을 두고 알릴지', () => {
  const rec = (workDate: string): AttendanceRecord =>
    ({
      id: 1,
      workDate,
      checkInAt: `${workDate}T09:00:00.000Z`,
      checkOutAt: null,
      workMinutes: null,
      note: null,
      checklist: [],
    }) as unknown as AttendanceRecord;

  it('오늘 기록이 있으면 그것을 본다', () => {
    const today = rec('2026-03-10');
    expect(reminderRecord({ record: today, openPrevious: null })).toBe(today);
  });

  it('어제 안 닫힌 기록으로는 알리지 않는다 — 없는 근무를 채웠다고 하게 된다', () => {
    expect(reminderRecord({ record: null, openPrevious: rec('2026-03-09') })).toBeNull();
  });

  it('오늘 기록이 있으면 어제 열린 기록에 끌려가지 않는다', () => {
    const today = rec('2026-03-10');
    expect(reminderRecord({ record: today, openPrevious: rec('2026-03-09') })).toBe(today);
  });

  it('아직 아무것도 못 받았으면 알릴 것이 없다', () => {
    expect(reminderRecord(undefined)).toBeNull();
  });
});
