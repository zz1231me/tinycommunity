import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { EventCategoryOption } from '../../../api/siteSettings';
import { readableText, useEventCategories, useCategoryColors } from './useEventCategories';

const stored: { value: EventCategoryOption[] } = { value: [] };

vi.mock('../../../store/siteSettings', () => ({
  useSiteSettings: (
    select: (s: { settings: { eventCategories: EventCategoryOption[] } }) => unknown
  ) => select({ settings: { eventCategories: stored.value } }),
}));

const render = (list: EventCategoryOption[]) => {
  stored.value = list;
  return renderHook(() => useEventCategories()).result.current;
};

const cat = (color: string): EventCategoryOption => ({
  key: 'k',
  label: '라벨',
  emoji: '🙂',
  color,
});

/** 두 색의 WCAG 명암비 */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const ch = [0, 2, 4].map(i => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('일정 분류 색 계산', () => {
  it('관리자가 정한 색을 칩 바탕색으로 쓴다', () => {
    expect(render([cat('#2dd4bf')])[0].bg).toBe('#2dd4bf');
  });

  it('테두리는 바탕색보다 어둡다', () => {
    const [c] = render([cat('#2dd4bf')]);
    expect(c.border).not.toBe(c.bg);
    expect(parseInt(c.border.slice(1), 16)).toBeLessThan(parseInt(c.bg.slice(1), 16));
  });

  // 관리자가 아무 색이나 고를 수 있으므로, 어떤 색이든 글자가 읽혀야 한다.
  it.each([
    '#fb7185',
    '#fbbf24',
    '#fb923c',
    '#6366f1',
    '#2dd4bf',
    '#94a3b8',
    '#ffffff',
    '#000000',
    '#7f7f7f',
  ])('%s 바탕에서 글자가 AA(4.5:1) 를 넘는다', color => {
    expect(contrast(color, readableText(color))).toBeGreaterThanOrEqual(4.5);
  });

  it('#rgb 짧은 색도 읽는다', () => {
    expect(render([cat('#abc')])[0].bg).toBe('#abc');
    expect(render([cat('#abc')])[0].border).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('색 표는 키로 찾는다', () => {
    stored.value = [cat('#2dd4bf')];
    const colors = renderHook(() => useCategoryColors()).result.current;
    expect(colors.k.label).toBe('라벨');
    expect(colors.없는키).toBeUndefined();
  });
});
