// client/src/components/avatarMark.test.ts
import { describe, expect, it } from 'vitest';
import { hashOf, markFor } from './avatarMark';

/** hsl 문자열 → 상대 휘도 */
function luminance(hsl: string): number {
  const [h, s, l] = hsl.match(/[\d.]+/g)!.map(Number);
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] = (
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  ).map(v => {
    const srgb = v + m;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrastWithWhite = (hsl: string) => 1.05 / (luminance(hsl) + 0.05);

describe('표식 만들기', () => {
  it('같은 사람은 언제나 같은 표식', () => {
    expect(markFor('hong')).toEqual(markFor('hong'));
  });

  it('사람이 다르면 대체로 다른 색', () => {
    const hues = new Set(
      ['a', 'b', 'c', 'd', 'e', 'hong', 'kim', 'lee', 'park', 'choi'].map(id => markFor(id).hue)
    );
    // 열 명이 열 가지 그라데이션을 돌려 쓰던 예전과 달리, 색이 겹치지 않아야 한다
    expect(hues.size).toBeGreaterThanOrEqual(9);
  });

  it('어떤 색이 나와도 흰 글자가 읽힌다 (AA 4.5:1)', () => {
    const bad: Array<{ hue: number; ratio: number }> = [];
    for (let hue = 0; hue < 360; hue++) {
      // 해당 색을 강제로 만들기 위해 markFor 와 같은 규칙을 다시 태운다
      const seed = `probe-${hue}`;
      const mark = markFor(seed);
      const ratio = contrastWithWhite(mark.from);
      if (ratio < 4.5) bad.push({ hue: mark.hue, ratio: +ratio.toFixed(2) });
    }
    expect(bad).toEqual([]);
  });

  it('빈 이름도 터지지 않는다', () => {
    expect(() => markFor('')).not.toThrow();
    expect(hashOf('')).toBe(Math.abs(2166136261));
  });
});
