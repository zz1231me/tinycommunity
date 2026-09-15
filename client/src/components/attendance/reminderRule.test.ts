// client/src/components/attendance/AttendanceReminder.test.ts
// 언제 알릴지의 규칙만 따로 고정한다.

import { describe, expect, it } from 'vitest';
import { shouldNotify } from './reminderRule';

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
