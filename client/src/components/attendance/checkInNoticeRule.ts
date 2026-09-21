// client/src/components/attendance/checkInNoticeRule.ts
// 출근 알림을 언제 띄울지의 규칙. 화면에서 떼어 두어야 규칙만 따로 검사할 수 있다.

/**
 * 이 시각(시)을 넘기면 더 이상 알리지 않는다.
 *
 * 출근 알림은 '하루를 시작하며 찍으세요' 라는 말이다. 밤 열한 시에 브라우저를 연
 * 사람에게 같은 말을 띄우면 틀린 말이 된다. 근무 시작 시각을 따로 설정받지 않으므로
 * 여기서 한 번 긋는다.
 */
export const NOTICE_UNTIL_HOUR = 18;

/**
 * 지금 출근을 알려야 하는가.
 *
 * 하루에 한 번만 띄운다. 매번 띄우면 출근을 안 찍기로 한 날(휴가·외근)에 화면을 옮길
 * 때마다 같은 창이 따라다닌다.
 */
export function shouldNoticeCheckIn(opts: {
  /** 기능이 켜져 있고 로그인한 상태인가 */
  enabled: boolean;
  /** 오늘 출근 기록이 이미 있는가 */
  hasRecordToday: boolean;
  /** 오늘 이미 알렸는가 */
  alreadyNoticed: boolean;
  /** 지금 시각(시, 0~23) */
  hour: number;
}): boolean {
  if (!opts.enabled) return false;
  if (opts.hasRecordToday) return false;
  if (opts.alreadyNoticed) return false;
  return opts.hour < NOTICE_UNTIL_HOUR;
}
