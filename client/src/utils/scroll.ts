/**
 * 콘텐츠 영역을 맨 위로 스크롤한다.
 *
 * 앱의 스크롤 주체가 두 가지라 분기한다:
 *  - 대시보드 내부 페이지: `<main>`(overflow-y-auto)이 스크롤 컨테이너
 *  - 독립 라우트(admin·profile 등): `<main>`이 없어 window/document가 스크롤
 *
 * 페이지마다 window.scrollTo / ref.scrollTo를 직접 부르면 스크롤 주체가 틀려
 * no-op이 되는 버그가 반복되므로, 항상 이 헬퍼로 통일한다.
 */
export function scrollContentToTop(behavior: ScrollBehavior = 'smooth'): void {
  const main = document.querySelector('main');
  if (main && main.scrollHeight > main.clientHeight + 1) {
    main.scrollTo({ top: 0, behavior });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
}
