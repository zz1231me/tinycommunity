// client/src/utils/themeColor.test.ts
// 브랜드 색 하나로 만드는 색 계단.
// 여기가 어긋나면 사이트 전체 색이 어긋나므로, "고른 색이 그대로 쓰이는가" 와
// "계단이 밝은 쪽에서 어두운 쪽으로 단조로운가" 를 고정한다.

import { describe, expect, it } from 'vitest';
import {
  buildColorScale,
  contrastRatio,
  hexToRgb,
  hslToHex,
  isWhiteTextReadable,
  rgbToHsl,
  SCALE_STEPS,
} from './themeColor';

/** 명암비 계산과 같은 방식의 상대 휘도 — 계단 단조성 확인용 */
function luminance(hex: string): number {
  const rgb = hexToRgb(hex)!;
  const ch = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

describe('hexToRgb', () => {
  it('#rrggbb 를 읽는다', () => {
    expect(hexToRgb('#14b8a6')).toEqual({ r: 0x14, g: 0xb8, b: 0xa6 });
  });

  it('#rgb 축약형도 읽는다', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(hexToRgb('  #ffffff  ')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('형식이 아니면 null', () => {
    expect(hexToRgb('teal')).toBeNull();
    expect(hexToRgb('#12345')).toBeNull();
    expect(hexToRgb('rgb(1,2,3)')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('HSL 왕복', () => {
  it('색을 HSL 로 바꿨다 되돌려도 거의 같다', () => {
    for (const hex of ['#14b8a6', '#545c6b', '#e74c3c', '#3498db']) {
      const back = hslToHex(rgbToHsl(hexToRgb(hex)!));
      const a = hexToRgb(hex)!;
      const b = hexToRgb(back)!;
      // 반올림 오차 1 단계까지 허용
      expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(1);
    }
  });

  it('무채색(회색)도 다루다 색이 끼지 않는다', () => {
    const gray = hslToHex(rgbToHsl(hexToRgb('#808080')!));
    const rgb = hexToRgb(gray)!;
    expect(rgb.r).toBe(rgb.g);
    expect(rgb.g).toBe(rgb.b);
  });
});

describe('buildColorScale', () => {
  it('11칸을 모두 만든다', () => {
    const scale = buildColorScale('#14b8a6')!;
    expect(
      Object.keys(scale)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual([...SCALE_STEPS]);
  });

  it('고른 색을 600 칸에 그대로 쓴다', () => {
    // 버튼 색이 고른 색과 다르면 관리자는 저장이 안 된 줄 안다
    expect(buildColorScale('#14b8a6')![600]).toBe('#14b8a6');
    expect(buildColorScale('#F00')![600]).toBe('#ff0000');
  });

  it('50 에서 950 으로 갈수록 어두워진다', () => {
    const scale = buildColorScale('#3498db')!;
    // 600 은 고른 색으로 덮어쓰므로 곡선에서 벗어날 수 있다 — 그 칸만 뺀다
    const steps = SCALE_STEPS.filter(s => s !== 600);
    for (let i = 1; i < steps.length; i++) {
      expect(luminance(scale[steps[i]])).toBeLessThan(luminance(scale[steps[i - 1]]));
    }
  });

  it('모두 유효한 #rrggbb 를 돌려준다', () => {
    const scale = buildColorScale('#e74c3c')!;
    for (const step of SCALE_STEPS) {
      expect(scale[step]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('색상(H)을 유지한다 — 파랑을 고르면 계단도 파랑이다', () => {
    const scale = buildColorScale('#3498db')!;
    const baseHue = rgbToHsl(hexToRgb('#3498db')!).h;
    for (const step of SCALE_STEPS) {
      const hue = rgbToHsl(hexToRgb(scale[step])!).h;
      expect(Math.abs(hue - baseHue)).toBeLessThan(6);
    }
  });

  it('형식이 잘못된 색이면 null — 호출부가 기본색을 쓰게 한다', () => {
    expect(buildColorScale('not-a-color')).toBeNull();
  });
});

describe('명암비', () => {
  it('흑백은 최대 대비 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('같은 색은 1', () => {
    expect(contrastRatio('#14b8a6', '#14b8a6')).toBeCloseTo(1, 5);
  });

  it('순서를 바꿔도 같은 값', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(contrastRatio('#fff', '#000')!, 5);
  });

  it('형식이 잘못되면 null', () => {
    expect(contrastRatio('nope', '#fff')).toBeNull();
  });
});

describe('흰 글씨 가독성 경고', () => {
  it('어두운 색은 흰 글씨가 읽힌다', () => {
    expect(isWhiteTextReadable('#545c6b')).toBe(true);
    expect(isWhiteTextReadable('#000000')).toBe(true);
  });

  it('밝은 노랑 위 흰 글씨는 읽히지 않는다', () => {
    // 관리자가 이런 색을 고르면 버튼 글자가 안 보인다 — 저장 전에 알려야 한다
    expect(isWhiteTextReadable('#fde047')).toBe(false);
    expect(isWhiteTextReadable('#ffffff')).toBe(false);
  });
});
