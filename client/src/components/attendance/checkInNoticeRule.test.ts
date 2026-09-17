// client/src/components/attendance/checkInNoticeRule.test.ts

import { describe, expect, it } from 'vitest';
import { shouldNoticeCheckIn, NOTICE_UNTIL_HOUR } from './checkInNoticeRule';

const base = {
  enabled: true,
  hasRecordToday: false,
  alreadyNoticed: false,
  hour: 9,
};

describe('출근 알림 시점', () => {
  it('아침에 아직 안 찍었으면 알린다', () => {
    expect(shouldNoticeCheckIn(base)).toBe(true);
  });

  it('이미 찍었으면 알리지 않는다', () => {
    expect(shouldNoticeCheckIn({ ...base, hasRecordToday: true })).toBe(false);
  });

  it('오늘 이미 알렸으면 다시 알리지 않는다', () => {
    // 화면을 옮길 때마다 따라다니면 안 된다
    expect(shouldNoticeCheckIn({ ...base, alreadyNoticed: true })).toBe(false);
  });

  it('기능이 꺼져 있거나 로그인 전이면 알리지 않는다', () => {
    expect(shouldNoticeCheckIn({ ...base, enabled: false })).toBe(false);
  });

  it('늦은 시각에는 알리지 않는다 — 하루를 시작하라는 말이 틀린 말이 된다', () => {
    expect(shouldNoticeCheckIn({ ...base, hour: NOTICE_UNTIL_HOUR })).toBe(false);
    expect(shouldNoticeCheckIn({ ...base, hour: 23 })).toBe(false);
  });

  it('기준 시각 직전까지는 알린다', () => {
    expect(shouldNoticeCheckIn({ ...base, hour: NOTICE_UNTIL_HOUR - 1 })).toBe(true);
  });
});
