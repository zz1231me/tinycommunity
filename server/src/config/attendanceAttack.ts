// server/src/config/attendanceAttack.ts
// 퇴근 공격권·방어권의 규칙과 기본값.
//
// ⚠️ 이 기능은 '화면에서만' 방해한다.
//
// 공격을 받아도 서버의 퇴근 기록 경로(attendance.service 의 checkOut)는 전혀 달라지지
// 않는다. 누른 순간이 그대로 기록된다. 버튼을 잠그지도 않는다 — 도망다니고 깜빡일 뿐,
// 끝내 누르면 눌린다. 장난 기능 하나 때문에 남이 내 근무 기록의 시각을 늦출 수 있게
// 되면, 그건 더 이상 장난이 아니라 근태 분쟁이 된다.
//
// 값·시간·횟수는 관리자 설정에서 온다(settingsCache 의 getAttackSettings).
// 여기 있는 것은 아직 아무것도 저장하지 않았을 때 쓰는 출발점이다.
// 이 파일은 settingsCache 를 부르지 않는다 — 순환 참조가 되기 때문이다.

/**
 * 공격의 종류.
 *  · chaos — 잠깐 동안 퇴근 버튼이 도망다니고, 사라졌다 나타나고, 화면이 가려진다
 *  · popup — 한 번 뜨는 쪽지. 받는 사람 화면에 알림창으로 한 번 뜨고 끝난다
 */
export type AttackKind = 'chaos' | 'popup';

export const ATTACK_KINDS = ['chaos', 'popup'] as const;

export const ATTACK_DEFAULTS = {
  /** 방해 공격 한 장 값 */
  cost: 300,
  /** 쪽지 한 장 값. 한 번 뜨고 마는 것이라 방해보다 싸다. */
  popupCost: 150,
  /** 방어권 한 장 값. 공격보다 싸야 방어할 마음이 든다. */
  defendCost: 200,
  /** 퇴근 버튼이 말을 안 듣는 시간(초) */
  blockSeconds: 60,
  /** 한 사람이 하루에 쓸 수 있는 공격 횟수 (종류 합쳐서) */
  dailyLimitPerAttacker: 5,
  // as const 를 붙이지 않는다 — 붙이면 값이 리터럴 타입으로 굳어 DB 에서 읽은
  // number 를 이 기본값 자리에 넣을 수 없다 (config/lottery 와 같은 이유).
};

/**
 * 쪽지에 적을 수 있는 글자 수.
 *
 * 이것만은 관리자 설정으로 열지 않는다. 입력 검증(zod) 스키마가 서버 기동 때 한 번
 * 만들어지는데, 그때 이 값이 필요하기 때문이다. 게다가 길이를 늘릴 수 있게 두면
 * 쪽지가 아니라 그냥 메시지 기능이 된다.
 */
export const ATTACK_MESSAGE_MAX = 40;

/**
 * 쪽지가 기다리는 시간(분).
 *
 * 받는 사람이 그 사이에 화면을 안 열면 그냥 사라진다. 며칠 뒤에 뜬금없이 뜨면
 * 장난이 아니라 그냥 이상한 일이다.
 */
export const ATTACK_POPUP_WINDOW_MINUTES = 5;

export function isAttackKind(value: unknown): value is AttackKind {
  return typeof value === 'string' && (ATTACK_KINDS as readonly string[]).includes(value);
}
