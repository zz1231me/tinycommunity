// 퇴근 공격권·방어권의 규칙과 기본값.
// 방해는 화면에서만 일어난다. 서버의 퇴근 기록 시각은 실제로 누른 순간 그대로다.
// 실제 값은 관리자 설정(settingsCache)에서 온다. 여기서 settingsCache 를 부르면 순환 참조다.

/**
 * 공격의 종류.
 *  · chaos — 잠깐 동안 퇴근 버튼이 도망다니고, 사라졌다 나타나고, 화면이 가려진다
 *  · hide  — 잠깐 동안 퇴근 버튼이 아예 보이지 않는다
 *  · quiz  — 잠깐 동안 퇴근 버튼을 누르면 계산 문제를 풀어야 한다
 */
export const ATTACK_KINDS = ['chaos', 'hide', 'quiz'] as const;

export type AttackKind = (typeof ATTACK_KINDS)[number];

/** 종류별 값·시간. quiz 는 chaos 와 같은 값을 쓰고, hide 만 따로 짧다. */
export function attackCost(kind: AttackKind, rules: { cost: number; hideCost: number }): number {
  return kind === 'hide' ? rules.hideCost : rules.cost;
}
export function attackSeconds(
  kind: AttackKind,
  rules: { blockSeconds: number; hideSeconds: number }
): number {
  return kind === 'hide' ? rules.hideSeconds : rules.blockSeconds;
}
export const ATTACK_NAME: Record<AttackKind, string> = {
  chaos: '퇴근 방해',
  hide: '퇴근 버튼 숨기기',
  quiz: '퇴근 문제 내기',
};

/** 한 사람에게 한꺼번에 쌓일 수 있는 공격 수. 차례로 적용된다. */
export const ATTACK_MAX_STACK = 20;

/**
 * 숨기기로 한 번에 가려 둘 수 있는 시간의 합(초).
 * hide 만 실제로 버튼을 누를 수 없으므로 개수와 별개로 합계 상한이 필요하다.
 */
export const HIDE_TOTAL_MAX_SECONDS = 60;

export const ATTACK_DEFAULTS = {
  /** 방해 공격 한 장 값 */
  cost: 300,
  /** 숨기기 공격 한 장 값 */
  hideCost: 300,
  /** 방어권 한 장 값 */
  defendCost: 200,
  /** 퇴근 버튼이 말을 안 듣는 시간(초) — chaos */
  blockSeconds: 60,
  /** 퇴근 버튼이 보이지 않는 시간(초) — hide. 실제로 누를 수 없으므로 chaos 보다 짧게 둔다. */
  hideSeconds: 20,
  /** 한 사람이 하루에 쓸 수 있는 공격 횟수 (종류 합쳐서) */
  dailyLimitPerAttacker: 5,
  // as const 를 붙이지 않는다. 리터럴 타입으로 굳으면 DB 에서 읽은 number 를 넣을 수 없다.
};

export function isAttackKind(value: unknown): value is AttackKind {
  return typeof value === 'string' && (ATTACK_KINDS as readonly string[]).includes(value);
}
