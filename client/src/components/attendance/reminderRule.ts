// 퇴근 알림을 언제 띄울지의 규칙.

import type { AttendanceRecord, AttendanceStatus } from '../../types/attendance.types';

/**
 * 알림 대상 기록. 오늘 것만이다.
 * openPrevious(어제 안 닫힌 기록)를 포함하면 근무 시간이 어제부터 계산된다.
 */
export function reminderRecord(
  status: Pick<AttendanceStatus, 'record' | 'openPrevious'> | undefined
): AttendanceRecord | null {
  return status?.record ?? null;
}

/** 기준 시간이 이만큼 남았을 때 미리 알린다 */
export const NOTICE_BEFORE_MIN = 10;
/** 기준 시간이 이만큼 지나면 한 번 더 알린다 */
export const NOTICE_LATE_AFTER_MIN = 3;

/**
 * 알림의 단계.
 *  · before — 기준 시간 10분 전
 *  · late   — 기준 시간이 3분 지났을 때
 */
export type NoticeStage = 'before' | 'late';

/**
 * 지금 어느 단계를 알려야 하는가. 알릴 것이 없으면 null.
 * 놓친 단계는 거슬러 올라가지 않고 늘 현재 시점에 맞는 단계를 반환한다.
 */
export function notifyStage(opts: {
  working: boolean;
  standardWorkMinutes: number;
  workedMinutes: number;
  noticedBefore: boolean;
  noticedLate: boolean;
}): NoticeStage | null {
  if (!opts.working) return null;
  // 기준이 정해져 있지 않으면 알릴 기준도 없다
  if (opts.standardWorkMinutes <= 0) return null;

  const over = opts.workedMinutes - opts.standardWorkMinutes;
  if (over >= NOTICE_LATE_AFTER_MIN) return opts.noticedLate ? null : 'late';
  // 기준 시각과 3분 뒤 사이는 알리지 않는다
  if (over >= 0) return null;
  if (-over <= NOTICE_BEFORE_MIN) return opts.noticedBefore ? null : 'before';
  return null;
}
