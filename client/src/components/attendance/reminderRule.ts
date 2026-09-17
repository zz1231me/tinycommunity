// client/src/components/attendance/reminderRule.ts
// 언제, 무엇을 두고 퇴근 알림을 띄울지의 규칙. 컴포넌트와 떼어 두어 따로 확인할 수 있게 한다.

import type { AttendanceRecord, AttendanceStatus } from '../../types/attendance.types';

/**
 * 알림의 대상이 되는 기록 — 오늘 것만이다.
 *
 * 어제 찍고 안 닫힌 기록(openPrevious)까지 대상으로 삼으면, 오늘 아직 출근하지 않은
 * 사람에게 난데없이 '기준 근무 시간을 채웠습니다' 가 뜬다. 어제 출근 시각부터 지금까지를
 * 근무로 세기 때문이다. 게다가 그 자리에서 '퇴근하기' 를 누르면 어제 기록이 지금 시각으로
 * 닫혀 하루짜리 근무가 만들어진다.
 *
 * 어제 것의 마감은 출근 확인 화면이 맡는다 — 거기에는 무엇이 닫히는지 알리는 경고가 있다.
 */
export function reminderRecord(
  status: Pick<AttendanceStatus, 'record' | 'openPrevious'> | undefined
): AttendanceRecord | null {
  return status?.record ?? null;
}

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
