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

/** 기준 시간이 이만큼 남았을 때 미리 알린다 */
export const NOTICE_BEFORE_MIN = 10;
/** 기준 시간이 이만큼 지나면 한 번 더 알린다 */
export const NOTICE_LATE_AFTER_MIN = 3;

/**
 * 알림의 단계.
 *  · before — 기준 시간 10분 전
 *  · due    — 기준 시간이 됐을 때
 *  · late   — 기준 시간이 3분 지났을 때
 */
export type NoticeStage = 'before' | 'due' | 'late';

/**
 * 지금 어느 단계를 알려야 하는가. 알릴 것이 없으면 null.
 *
 * 세 번 알리는 이유: 10분 전 한 번만 띄우면 그 사이에 하던 일을 마저 하다가 잊고,
 * 정각에 한 번 더 띄워도 '조금만 더' 하다가 또 지나간다.
 *
 * 늘 지금 시점에 맞는 단계로 간다 — 지난 단계를 못 봤더라도 거슬러 올라가지 않는다.
 * 그 시간에 브라우저가 닫혀 있던 사람에게 뒤늦게 '10분 전입니다' 라고 하면 틀린 말이다.
 */
export function notifyStage(opts: {
  working: boolean;
  standardWorkMinutes: number;
  workedMinutes: number;
  noticedBefore: boolean;
  noticedDue: boolean;
  noticedLate: boolean;
}): NoticeStage | null {
  if (!opts.working) return null;
  // 기준이 정해져 있지 않으면 알릴 기준도 없다
  if (opts.standardWorkMinutes <= 0) return null;

  const over = opts.workedMinutes - opts.standardWorkMinutes;
  if (over >= NOTICE_LATE_AFTER_MIN) return opts.noticedLate ? null : 'late';
  if (over >= 0) return opts.noticedDue ? null : 'due';
  if (-over <= NOTICE_BEFORE_MIN) return opts.noticedBefore ? null : 'before';
  return null;
}
