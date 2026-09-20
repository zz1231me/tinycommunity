// server/src/config/attendanceAttack.ts
// 퇴근 공격권·방어권의 규칙과 기본값.
//
// ⚠️ 이 기능은 '화면에서만' 방해한다.
//
// 공격을 받아도 서버의 퇴근 기록 경로(attendance.service 의 checkOut)는 전혀 달라지지
// 않는다. 누른 순간이 그대로 기록된다. 장난 기능 하나 때문에 남이 내 근무 기록의
// 시각을 늦출 수 있게 되면, 그건 더 이상 장난이 아니라 근태 분쟁이 된다.
//
// 종류에 따라 방해하는 방식이 다르다.
//  · chaos 는 버튼을 잠그지 않는다 — 도망다니고 깜빡일 뿐, 끝내 누르면 눌린다.
//  · hide 는 잠깐 동안 버튼을 아예 감춘다. 그 사이에는 누를 수 없다.
//  · quiz 는 버튼을 누르면 계산 문제가 나온다. 맞히면 그대로 퇴근이 찍힌다 — 틀리면 새 문제.
//    답을 못 내 막히는 일은 없다(초등 사칙연산, 정답이 늘 정수).
//
// hide 를 짧게(기본 10초) 둔 이유가 여기에 있다. 감추는 시간이 길어지면 '누르기
// 성가시다' 가 아니라 '퇴근을 못 한다' 가 되고, 그 순간 위의 선을 넘는다.
// 기록되는 시각은 어느 쪽이든 실제로 누른 순간 그대로다.
//
// 값·시간·횟수는 관리자 설정에서 온다(settingsCache 의 getAttackSettings).
// 여기 있는 것은 아직 아무것도 저장하지 않았을 때 쓰는 출발점이다.
// 이 파일은 settingsCache 를 부르지 않는다 — 순환 참조가 되기 때문이다.

/**
 * 공격의 종류.
 *  · chaos — 잠깐 동안 퇴근 버튼이 도망다니고, 사라졌다 나타나고, 화면이 가려진다
 *  · hide  — 잠깐 동안 퇴근 버튼이 아예 보이지 않는다
 *  · quiz  — 잠깐 동안 퇴근 버튼을 누르면 계산 문제를 풀어야 한다
 */
export const ATTACK_KINDS = ['chaos', 'hide', 'quiz'] as const;

export type AttackKind = (typeof ATTACK_KINDS)[number];

/**
 * 종류별 값·시간·이름.
 * 문제 내기는 방해와 같은 값·시간을 쓴다 — 둘 다 '성가시지만 끝내 누를 수 있는' 쪽이다.
 * (숨기기만 정말로 누를 수 없어 따로 짧다.) 따로 값을 매기려면 관리자 설정에 칸을 더한다.
 */
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

/**
 * 한 사람에게 한꺼번에 쌓일 수 있는 공격 수.
 *
 * 쌓인 공격은 줄을 서서 차례로 걸리고(시간이 이어 붙는다), 쌓인 수만큼 퇴근 버튼이 더
 * 사나워진다. 방어권 한 장은 맨 앞 하나를 푼다.
 *
 * 숨기기는 그동안 정말로 누를 수 없으므로 상한이 곧 최악의 시간이다 — 기본 20초 × 10 =
 * 3분 20초. 퇴근 기록 시각은 어느 쪽이든 실제로 누른 순간 그대로다.
 */
export const ATTACK_MAX_STACK = 10;

/**
 * 숨기기로 한 번에 가려 둘 수 있는 시간의 합(초).
 *
 * 숨기기는 그동안 정말로 누를 수 없는 유일한 종류다 — 마우스로도, Tab 으로도, 화면
 * 낭독기로도 퇴근 버튼에 닿을 수 없다. 그런데 상한은 '개수'(10개)뿐이라, 관리자가 한 장을
 * 60초로 올려 두면 10장 = 10분 동안 퇴근을 아예 못 하게 만들 수 있었다. 장난이 아니라
 * 근태 방해가 되는 선이다. 개수와 무관하게 합이 이 시간을 넘으면 더 받지 않는다.
 * (방해·문제 내기는 끝내 누를 수 있으므로 이 제한이 없다.)
 */
export const HIDE_TOTAL_MAX_SECONDS = 60;

export const ATTACK_DEFAULTS = {
  /** 방해 공격 한 장 값 */
  cost: 300,
  /** 숨기기 공격 한 장 값 */
  hideCost: 300,
  /** 방어권 한 장 값. 공격보다 싸야 방어할 마음이 든다. */
  defendCost: 200,
  /** 퇴근 버튼이 말을 안 듣는 시간(초) — chaos */
  blockSeconds: 60,
  /**
   * 퇴근 버튼이 보이지 않는 시간(초) — hide.
   *
   * chaos 보다 훨씬 짧다. chaos 는 누르기 성가실 뿐 끝내 누를 수 있지만, hide 는
   * 그 시간 동안 정말로 누를 수 없다. 길게 두면 남의 퇴근을 실제로 막는 기능이 된다.
   *
   * 10초는 가짜 버튼을 눌러 보고 속았다는 걸 알기도 전에 끝나 싱거웠다. 20초로 올린다 —
   * 방해(60초)의 3분의 1이다. 30초를 넘기는 것은 권하지 않는다. 관리자 설정 상한은 60초.
   * (이미 설정을 저장한 사이트는 그 값이 그대로다 — 이 값은 처음 만들 때의 기본값이다.)
   */
  hideSeconds: 20,
  /** 한 사람이 하루에 쓸 수 있는 공격 횟수 (종류 합쳐서) */
  dailyLimitPerAttacker: 5,
  // as const 를 붙이지 않는다 — 붙이면 값이 리터럴 타입으로 굳어 DB 에서 읽은
  // number 를 이 기본값 자리에 넣을 수 없다 (config/lottery 와 같은 이유).
};

export function isAttackKind(value: unknown): value is AttackKind {
  return typeof value === 'string' && (ATTACK_KINDS as readonly string[]).includes(value);
}
