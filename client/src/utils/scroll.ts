/**
 * 콘텐츠 영역을 맨 위로 스크롤한다.
 * 스크롤 주체가 대시보드는 `<main>`, 독립 라우트는 window 라 분기가 필요하다.
 * 페이지에서 window.scrollTo 를 직접 부르지 말고 항상 이 헬퍼를 쓴다.
 */
export function scrollContentToTop(behavior: ScrollBehavior = 'smooth'): void {
  const main = document.querySelector('main');
  if (main && main.scrollHeight > main.clientHeight + 1) {
    main.scrollTo({ top: 0, behavior });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
}
