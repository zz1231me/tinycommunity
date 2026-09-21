// 문제 내기 공격의 문제 생성. 화면(QuizGate)과 분리해 둔다.

export interface Question {
  text: string;
  answer: number;
}

type Rand = () => number;

/** lo 이상 hi 이하의 정수 */
function int(rand: Rand, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/**
 * 쌓인 공격 수(level)만큼 어려운 문제.
 *  - 1~2: 두 자리 덧셈·뺄셈
 *  - 3~5: 곱셈 또는 세 수의 덧셈·뺄셈
 *  - 6~ : 곱하고 더하거나 빼기
 * 뺄셈의 답이 음수가 되지 않게 큰 수에서 뺀다.
 */
export function makeQuestion(level: number, rand: Rand = Math.random): Question {
  if (level <= 2) {
    const a = int(rand, 12, 89);
    const b = int(rand, 12, 89);
    if (rand() < 0.5) return { text: `${a} + ${b}`, answer: a + b };
    const [big, small] = a >= b ? [a, b] : [b, a];
    return { text: `${big} − ${small}`, answer: big - small };
  }
  if (level <= 5) {
    if (rand() < 0.5) {
      const a = int(rand, 6, 19);
      const b = int(rand, 3, 9);
      return { text: `${a} × ${b}`, answer: a * b };
    }
    const a = int(rand, 30, 99);
    const b = int(rand, 11, 49);
    const c = int(rand, 11, 29);
    // a + b − c 는 a ≥ 30 > c 라 늘 양수다
    return { text: `${a} + ${b} − ${c}`, answer: a + b - c };
  }
  const a = int(rand, 6, 14);
  const b = int(rand, 4, 9);
  const c = int(rand, 7, 23);
  // a × b ≥ 24 > c 라 빼도 양수다
  if (rand() < 0.5) return { text: `${a} × ${b} − ${c}`, answer: a * b - c };
  return { text: `${a} × ${b} + ${c}`, answer: a * b + c };
}

/** 연달아 맞혀야 하는 수. 쌓일수록 늘어난다. */
export function quizCount(level: number): number {
  if (level >= 8) return 3;
  if (level >= 4) return 2;
  return 1;
}
