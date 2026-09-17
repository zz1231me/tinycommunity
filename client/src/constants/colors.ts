// 데이터 색상 fallback 중앙 관리 — 컴포넌트마다 흩어져 하드코딩되던 hex를 한 곳에서 관리한다.
// (UI 크롬 색은 Tailwind 토큰/프리미티브를 사용; 여기는 사용자 데이터에 색이 없을 때의 기본값)

/** 색이 지정되지 않은 태그의 기본 색 — 뉴트럴 slate */
export const DEFAULT_TAG_COLOR = '#64748b';

/** 태그 색상 추천 팔레트 — 앱 톤과 어울리는 카테고리 색(보라 제외). 자동 추천/빠른 선택에 사용. */
export const TAG_COLOR_PALETTE = [
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#22c55e', // green
  '#f59e0b', // amber
  '#f97316', // orange
  '#f43f5e', // rose
  '#ec4899', // pink
  '#64748b', // slate
] as const;

/** 이미 쓰인 색을 피해 다음 태그 색을 추천 — 다 쓰면 개수 기준으로 순환. */
export function suggestTagColor(existingColors: string[]): string {
  const used = new Set(existingColors.map(c => c.toLowerCase()));
  const unused = TAG_COLOR_PALETTE.find(c => !used.has(c.toLowerCase()));
  return unused ?? TAG_COLOR_PALETTE[existingColors.length % TAG_COLOR_PALETTE.length];
}

/** 분류(카테고리)가 없는 일정의 기본 색 — teal 액센트 */
export const DEFAULT_EVENT_COLOR = '#14b8a6';
