// 일정 분류 목록. 관리자가 사이트 설정에서 정하고, 화면은 그 값을 읽어 쓴다.
//
// 예전에는 constants.ts 에 두 벌(고르는 목록·칩 색 표), 관리자 목록 화면에 또 한 벌,
// 모두 세 벌이 박혀 있었다. 회사마다 쓰는 말이 다른데(재택·출장·교육…) 바꾸려면
// 배포를 해야 했다.
//
// 저장되는 것은 분류마다 색 하나다. 테두리와 글자색은 여기서 계산한다 —
// 세 가지를 따로 저장하면 관리자가 읽을 수 없는 조합을 만들 수 있고, 색을 바꿀 때
// 나머지 둘을 함께 고치지 않으면 서로 어긋난다.

import { useMemo } from 'react';
import { useSiteSettings } from '../../../store/siteSettings';
import type { Category, CategoryColor } from './types';

/** #rgb·#rrggbb → [r,g,b] */
function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** 테두리는 같은 색을 조금 어둡게. 칩이 바탕에서 떨어져 보이게 하는 선이다. */
function darken(hex: string, amount = 0.14): string {
  const [r, g, b] = toRgb(hex);
  const to = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${[to(r), to(g), to(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// 검정·흰색 둘만 후보로 둔다. 이 둘이면 어떤 바탕색이든 둘 중 하나가 WCAG AA(4.5:1)
// 를 넘는다 — 두 명암비가 같아지는 가장 불리한 바탕(상대 휘도 0.179)에서도 4.58:1 이다.
// 회색(#1f2937)을 후보로 두면 이 성질이 깨진다: 인디고(#6366f1) 바탕에서 최선이 4.47:1 로
// 떨어진다. 관리자가 색을 아무거나 골라도 글자가 읽히게 하려고 가장 센 짝을 쓴다.
const DARK_TEXT = '#000000';
const LIGHT_TEXT = '#ffffff';

/** WCAG 상대 휘도 */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 바탕색 위에서 더 잘 읽히는 글자색. 휘도 기준선을 하나 정해 두지 않고 두 후보의
 * 명암비를 실제로 재서 높은 쪽을 쓴다 — 주황(#fb923c)처럼 가운데쯤 있는 색은
 * 기준선을 어디에 두느냐에 따라 흰 글자가 뽑히는데, 그 조합은 명암비가 2.3 밖에
 * 안 된다(검은 글자는 7.2).
 */
export function readableText(hex: string): string {
  const bg = luminance(hex);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio(bg, luminance(DARK_TEXT)) >= ratio(bg, luminance(LIGHT_TEXT))
    ? DARK_TEXT
    : LIGHT_TEXT;
}

/** 고르는 자리가 쓰는 목록 */
export function useEventCategories(): Category[] {
  const stored = useSiteSettings(s => s.settings.eventCategories);
  return useMemo(
    () =>
      stored.map(c => ({
        key: c.key,
        emoji: c.emoji,
        label: c.label,
        bg: c.color,
        border: darken(c.color),
      })),
    [stored]
  );
}

/** 달력 칩·상세가 쓰는 색 표(키로 찾는다) */
export function useCategoryColors(): Record<string, CategoryColor> {
  const list = useEventCategories();
  return useMemo(() => {
    const out: Record<string, CategoryColor> = {};
    for (const c of list) {
      out[c.key] = { bg: c.bg, border: c.border, label: c.label };
    }
    return out;
  }, [list]);
}
