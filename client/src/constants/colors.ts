// 데이터 색상 fallback 중앙 관리 — 컴포넌트마다 흩어져 하드코딩되던 hex를 한 곳에서 관리한다.
// (UI 크롬 색은 Tailwind 토큰/프리미티브를 사용; 여기는 사용자 데이터에 색이 없을 때의 기본값)

/** 색이 지정되지 않은 태그의 기본 색 — 뉴트럴 slate */
export const DEFAULT_TAG_COLOR = '#64748b';

/** 분류(카테고리)가 없는 일정의 기본 색 — teal 액센트 */
export const DEFAULT_EVENT_COLOR = '#14b8a6';
