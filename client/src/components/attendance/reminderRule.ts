// client/src/components/attendance/reminderRule.ts
// 언제 퇴근 알림을 띄울지의 규칙. 컴포넌트와 떼어 두어 따로 확인할 수 있게 한다.

/** 기준 시간이 이만큼 남았을 때 알린다 */
export const NOTICE_BEFORE_MIN = 10;

/**
 * 지금 알려야 하는가.
 *
 * 기준 시간을 이미 넘긴 경우에도 알린다 — 넘긴 줄 모르고 있는 쪽이 더 곤란하다.
 */
export function shouldNotify(opts: {
  working: boolean;
  standardWorkMinutes: number;
  workedMinutes: number;
  alreadyNoticed: boolean;
}): boolean {
  if (!opts.working || opts.alreadyNoticed) return false;
  // 기준이 정해져 있지 않으면 알릴 기준도 없다
  if (opts.standardWorkMinutes <= 0) return false;
  return opts.standardWorkMinutes - opts.workedMinutes <= NOTICE_BEFORE_MIN;
}
