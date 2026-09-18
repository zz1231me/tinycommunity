// client/src/components/attendance/quiz.test.ts
// 문제는 늘 풀 수 있어야 한다 — 정답이 0 이상의 정수이고, 적힌 식과 맞는다.

import { describe, expect, it } from 'vitest';
import { makeQuestion, quizCount } from './quiz';

/** 식을 직접 계산한다 — makeQuestion 이 준 answer 를 믿지 않는다 */
const evaluate = (text: string) =>
  Function(`return ${text.replace(/×/g, '*').replace(/−/g, '-')}`)() as number;

describe('문제', () => {
  it.each([1, 2, 3, 5, 6, 10])(
    '%s 개 쌓였을 때: 적힌 식의 값이 정답이고, 0 이상의 정수다',
    level => {
      for (let i = 0; i < 500; i++) {
        const q = makeQuestion(level);
        expect(q.answer).toBe(evaluate(q.text));
        expect(Number.isInteger(q.answer)).toBe(true);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
    }
  );

  it('난수가 끝값이어도 식과 답이 맞는다', () => {
    for (const r of [0, 0.4999, 0.5, 0.999999]) {
      for (const level of [1, 4, 9]) {
        const q = makeQuestion(level, () => r);
        expect(q.answer).toBe(evaluate(q.text));
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('쌓일수록 어려워진다 — 하나일 때는 곱셈이 없고, 많이 쌓이면 곱셈이 늘 들어간다', () => {
    for (let i = 0; i < 200; i++) {
      expect(makeQuestion(1).text).not.toContain('×');
      expect(makeQuestion(8).text).toContain('×');
    }
  });

  it('연달아 맞혀야 하는 수는 쌓일수록 늘지만 셋을 넘지 않는다', () => {
    expect([1, 3, 4, 7, 8, 10].map(quizCount)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
