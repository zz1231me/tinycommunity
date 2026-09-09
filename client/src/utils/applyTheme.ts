// client/src/utils/applyTheme.ts
// 관리자가 고른 브랜드 색을 실제 화면에 입힌다.
//
// Tailwind v4 는 색 유틸리티를 var(--color-primary-600) 으로 컴파일하므로,
// :root 에서 그 변수만 덮어쓰면 앱 전체 색이 한 번에 바뀐다.
// 스타일시트를 다시 빌드하거나 클래스명을 바꿀 필요가 없다.

import { buildColorScale, SCALE_STEPS } from './themeColor';

const STYLE_ID = 'admin-theme-overrides';

/** 색이 지정되지 않았으면 이 함수가 만든 <style> 만 걷어낸다 — 기본 색으로 되돌아간다 */
function removeOverrides() {
  document.getElementById(STYLE_ID)?.remove();
  delete document.documentElement.dataset.brand;
}

function declarationsFor(name: 'primary' | 'secondary', hex: string | null): string[] {
  if (!hex) return [];
  const scale = buildColorScale(hex);
  // 형식이 잘못된 값이면 손대지 않는다 — 깨진 색보다 기본 색이 낫다
  if (!scale) return [];
  return SCALE_STEPS.map(step => `--color-${name}-${step}: ${scale[step]};`);
}

/**
 * 브랜드 색을 문서에 적용한다. 둘 다 null 이면 기본 색으로 되돌린다.
 *
 * 값은 buildColorScale 이 만든 #rrggbb 만 들어간다 —
 * 관리자 입력을 그대로 스타일시트에 넣지 않으므로 임의 CSS 가 끼어들 수 없다.
 */
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

  // 주버튼은 기본이 뉴트럴 먹색이라 --color-primary-* 만 바꿔서는 따라오지 않는다.
  // 브랜드 색이 지정된 동안만 주버튼도 그 색을 쓰도록 표시를 남긴다(index.css 참고).
  // 이 표시가 없으면 관리자는 색을 골랐는데 가장 눈에 띄는 버튼이 그대로라
  // 적용이 안 된 줄 안다.
  if (primary) document.documentElement.dataset.brand = 'on';
  else delete document.documentElement.dataset.brand;
}
