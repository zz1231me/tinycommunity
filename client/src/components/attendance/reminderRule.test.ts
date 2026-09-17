// client/src/components/attendance/reminderRule.test.ts
// 언제 알릴지의 규칙만 따로 고정한다.

import { describe, expect, it } from 'vitest';
import { reminderRecord, notifyStage } from './reminderRule';
import type { AttendanceRecord } from '../../types/attendance.types';

const base = {
  working: true,
  standardWorkMinutes: 480,
  workedMinutes: 0,
  noticedBefore: false,
  noticedDue: false,
  noticedLate: false,
};

describe('퇴근 알림 시점', () => {
  it('10분 넘게 남았으면 알리지 않는다', () => {
    expect(notifyStage({ ...base, workedMinutes: 469 })).toBeNull();
  });

  it('10분 남으면 미리 알린다', () => {
    expect(notifyStage({ ...base, workedMinutes: 470 })).toBe('before');
  });

  it('미리 알린 뒤 아직 시간이 남았으면 다시 알리지 않는다', () => {
    expect(notifyStage({ ...base, workedMinutes: 475, noticedBefore: true })).toBeNull();
  });

  it('기준 시간이 되면 한 번 더 알린다 — 10분 전 한 번으로는 잊는다', () => {
    expect(notifyStage({ ...base, workedMinutes: 480, noticedBefore: true })).toBe('due');
  });

  it('정각 직후에는 아직 정각 단계다 — 3분은 지나야 다음으로 간다', () => {
    expect(notifyStage({ ...base, workedMinutes: 482, noticedBefore: true })).toBe('due');
  });

  it('3분이 지나면 한 번 더 알린다 — 정각에 보고도 "조금만 더" 하다 지나간다', () => {
    expect(
      notifyStage({ ...base, workedMinutes: 483, noticedBefore: true, noticedDue: true })
    ).toBe('late');
  });

  it('정각 알림을 놓쳤어도 3분이 지났으면 늦은 단계로 간다', () => {
    // 지난 단계로 거슬러 올라가지 않는다 — 지금 시점에 맞는 말을 해야 한다
    expect(notifyStage({ ...base, workedMinutes: 600 })).toBe('late');
  });

  it('세 단계를 모두 봤으면 더 알리지 않는다', () => {
    expect(
      notifyStage({
        ...base,
        workedMinutes: 600,
        noticedBefore: true,
        noticedDue: true,
        noticedLate: true,
      })
    ).toBeNull();
  });

  it('퇴근을 찍었으면 알리지 않는다', () => {
    expect(notifyStage({ ...base, working: false, workedMinutes: 600 })).toBeNull();
  });

  it('기준 시간이 없으면 알리지 않는다', () => {
    expect(notifyStage({ ...base, standardWorkMinutes: 0, workedMinutes: 600 })).toBeNull();
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
