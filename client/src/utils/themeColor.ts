// client/src/utils/themeColor.ts
// 관리자가 고른 브랜드 색 하나로 Tailwind 색 계단(50~950)을 만든다.
//
// 화면은 primary-50(연한 배경)부터 primary-900(진한 글자)까지 11칸을 쓰는데,
// 관리자에게는 한 색만 받는다.
//
// 고른 색의 색상(H)과 채도(S)를 유지한 채 명도(L)만 디자인 시스템과 같은 곡선으로
// 배치한다. 600 칸은 고른 색을 그대로 써서 버튼 색이 선택한 색과 일치하게 한다.

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];

/**
 * 칸별 목표 명도(%). 기존 design-system 의 primary 계단에서 뽑았다.
 * 이 곡선을 유지해야 색만 바뀌고 명암 구조는 그대로 남는다.
 */
const TARGET_LIGHTNESS: Record<ScaleStep, number> = {
  50: 97,
  100: 94,
  200: 88,
  300: 77,
  400: 62,
  500: 47,
  600: 38,
  700: 31,
  800: 26,
  900: 21,
  950: 14,
};

/** 아주 밝거나 어두운 칸에서 채도를 그대로 두면 색이 탁해 보인다 */
const SATURATION_FACTOR: Record<ScaleStep, number> = {
  50: 0.45,
  100: 0.55,
  200: 0.7,
  300: 0.85,
  400: 0.95,
  500: 1,
  600: 1,
  700: 1,
  800: 0.95,
  900: 0.9,
  950: 0.85,
};

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const SHORT_HEX = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const FULL_HEX = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/;

/** #rgb / #rrggbb 를 받는다. 형식이 아니면 null (서버도 같은 형식만 저장한다) */
export function hexToRgb(hex: string): Rgb | null {
  const value = hex.trim();

  const short = value.match(SHORT_HEX);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }

  const full = value.match(FULL_HEX);
  if (!full) return null;
  return {
    r: parseInt(full[1], 16),
    g: parseInt(full[2], 16),
    b: parseInt(full[3], 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = ln - c / 2;

  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];

  return rgbToHex({ r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 });
}

/**
 * 브랜드 색 하나로 50~950 계단을 만든다.
 * 형식이 잘못된 색이면 null — 호출부는 기본 색을 그대로 쓴다.
 */
export function buildColorScale(hex: string): Record<ScaleStep, string> | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const { h, s } = rgbToHsl(rgb);
  const scale = {} as Record<ScaleStep, string>;
  for (const step of SCALE_STEPS) {
    scale[step] = hslToHex({
      h,
      s: s * SATURATION_FACTOR[step],
      l: TARGET_LIGHTNESS[step],
    });
  }
  // 고른 색은 600 칸에 그대로 둔다 — 버튼 색이 고른 색과 미묘하게 다르면
  // 관리자는 저장이 안 된 줄 안다.
  scale[600] = rgbToHex(rgb);
  return scale;
}

/** WCAG 상대 휘도 */
function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 두 색의 명암비 (1~21). 형식이 잘못되면 null */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 이 색을 주요 버튼 배경으로 썼을 때 흰 글씨가 읽히는가.
 *
 * 관리자가 노란색을 고르면 버튼 위 흰 글씨가 보이지 않는다.
 * 막지는 않되(브랜드 색은 관리자가 정할 일이다) 저장 전에 알려 준다.
 */
export function isWhiteTextReadable(hex: string): boolean {
  const ratio = contrastRatio(hex, '#ffffff');
  return ratio !== null && ratio >= 4.5;
}
