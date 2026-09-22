// 포인트 절반 날리기. 아주 낮은 확률로 상대의 포인트 절반을 없앤다.
//
// 퇴근 공격(config/attendanceAttack)과 다른 점:
//  · 화면 장난이 아니라 포인트가 실제로 사라진다. 없어진 몫은 아무에게도 가지 않는다.
//  · 누가 걸었는지 상대에게 알리지 않는다(서버 기록에는 남는다).
//  · 근무 중이 아니어도 걸 수 있다. 포인트는 출퇴근과 상관이 없다.
// 하루 횟수는 퇴근 공격과 함께 센다 — services/attackQuota 를 본다.

/** 한 번 던지는 값. 실패해도 돌려주지 않는다. */
export const HALVE_COST = 300;

/** 성공 확률(%). 100 분의 1. */
export const HALVE_SUCCESS_PERCENT = 1;

export const HALVE_NAME = '포인트 절반 날리기';

/** 당한 사람에게 보이는 이름. 누가 걸었는지는 끝까지 밝히지 않는다. */
export const HALVE_ANONYMOUS = '누군가';

/** 사라질 몫. 홀수는 버려서 상대에게 유리하게 둔다. */
export function halfOf(balance: number): number {
  return Math.floor(Math.max(0, balance) / 2);
}
