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
 */
export type AttackKind = 'chaos' | 'hide';

export const ATTACK_KINDS = ['chaos', 'hide'] as const;

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
