// server/src/config/attendanceAttack.ts
// 퇴근 공격권·방어권의 규칙.
//
// ⚠️ 이 기능은 '화면에서만' 막는다.
//
// 공격을 받아도 서버의 퇴근 기록 경로(attendance.service 의 checkOut)는 전혀 달라지지
// 않는다. 누른 순간이 그대로 기록된다. 장난 기능 하나 때문에 남이 내 근무 기록의
// 시각을 늦출 수 있게 되면, 그건 더 이상 장난이 아니라 근태 분쟁이 된다.
//
// 그래서 공격이 하는 일은 딱 하나다 — 잠깐 버튼을 눌러 보고 싶게 만드는 것.

export const ATTACK_RULES = {
  /** 공격권 한 장 값 */
  cost: 300,
  /** 방어권 한 장 값. 공격보다 싸야 방어할 마음이 든다. */
  defendCost: 200,
  /** 화면에서 퇴근 버튼이 잠겨 보이는 시간(초) */
  blockSeconds: 60,
  /** 한 사람이 하루에 쓸 수 있는 공격 횟수 */
  dailyLimitPerAttacker: 5,
} as const;
