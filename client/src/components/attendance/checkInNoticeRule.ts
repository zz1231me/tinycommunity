// 출근 알림을 언제 띄울지의 규칙. 화면과 떼어 두어야 따로 검사할 수 있다.

/** 이 시각(시)을 넘기면 알리지 않는다. */
export const NOTICE_UNTIL_HOUR = 18;

/** 지금 출근을 알려야 하는가. 하루에 한 번만 띄운다. */
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
