// 관리자가 고른 브랜드 색을 :root 의 --color-* 변수로 덮어써 적용한다.

import { buildColorScale, SCALE_STEPS } from './themeColor';

const STYLE_ID = 'admin-theme-overrides';

/** 이 함수가 만든 <style> 만 걷어내 기본 색으로 되돌린다. */
function removeOverrides() {
  document.getElementById(STYLE_ID)?.remove();
  delete document.documentElement.dataset.brand;
}

function declarationsFor(name: 'primary' | 'secondary', hex: string | null): string[] {
  if (!hex) return [];
  const scale = buildColorScale(hex);
  // 형식이 잘못된 값이면 손대지 않는다.
  if (!scale) return [];
  return SCALE_STEPS.map(step => `--color-${name}-${step}: ${scale[step]};`);
}

/** 브랜드 색을 적용한다. 둘 다 null 이면 기본 색으로 되돌린다. 값은 buildColorScale 이 만든 #rrggbb 만 들어간다. */
export function applyTheme(primary: string | null, secondary: string | null): void {
  const declarations = [
    ...declarationsFor('primary', primary),
    ...declarationsFor('secondary', secondary),
  ];

  if (declarations.length === 0) {
    removeOverrides();
    return;
  }

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `:root{${declarations.join('')}}`;

  // 주버튼은 --color-primary-* 만으로는 바뀌지 않아 data-brand 표시가 필요하다(index.css 참고).
  if (primary) document.documentElement.dataset.brand = 'on';
  else delete document.documentElement.dataset.brand;
}
