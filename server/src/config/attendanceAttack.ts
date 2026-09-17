// server/src/config/attendanceAttack.ts
// 퇴근 공격권·방어권의 규칙.
//
// ⚠️ 이 기능은 '화면에서만' 방해한다.
//
// 공격을 받아도 서버의 퇴근 기록 경로(attendance.service 의 checkOut)는 전혀 달라지지
// 않는다. 누른 순간이 그대로 기록된다. 장난 기능 하나 때문에 남이 내 근무 기록의
// 시각을 늦출 수 있게 되면, 그건 더 이상 장난이 아니라 근태 분쟁이 된다.
//
// 그래서 공격이 하는 일은 딱 하나다 — 퇴근 버튼을 '누르기 성가시게' 만드는 것.
// 버튼을 잠그지도 않는다. 도망다니고 깜빡일 뿐, 끝내 누르면 눌린다.

/**
 * 공격의 종류.
 *  · chaos — 잠깐 동안 퇴근 버튼이 도망다니고, 사라졌다 나타나고, 화면이 가려진다
 *  · popup — 한 번 뜨는 쪽지. 받는 사람 화면에 알림창으로 한 번 뜨고 끝난다
 */
export type AttackKind = 'chaos' | 'popup';

export const ATTACK_KINDS = ['chaos', 'popup'] as const;

export const ATTACK_RULES = {
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
  /** 쪽지에 적을 수 있는 글자 수. 길게 쓰라고 만든 창구가 아니다. */
  messageMaxLength: 40,
  /**
   * 쪽지가 기다리는 시간(분).
   *
   * 받는 사람이 그 사이에 화면을 안 열면 그냥 사라진다. 며칠 뒤에 뜬금없이 뜨면
   * 장난이 아니라 그냥 이상한 일이다.
   */
  popupWindowMinutes: 5,
} as const;

export function isAttackKind(value: unknown): value is AttackKind {
  return typeof value === 'string' && (ATTACK_KINDS as readonly string[]).includes(value);
}

/** 그 종류 한 번에 드는 값 */
export function attackCost(kind: AttackKind): number {
  return kind === 'popup' ? ATTACK_RULES.popupCost : ATTACK_RULES.cost;
}
