// 대화상자가 열린 동안 뒤 화면 스크롤을 막는다.
// 여러 곳이 겹쳐 잠그므로 세어 두고, 처음 잠글 때만 원래 값을 기억해 마지막에 되돌린다.
// 스크롤바가 사라지며 본문이 옆으로 튀지 않게 주는 여백도 여기서 함께 다룬다.
// 잠금과 여백의 주인이 다르면 한쪽만 되돌아가 본문이 밀린 채로 남는다.

let depth = 0;
let original = '';
let originalPad = '';

export function lockScroll(): void {
  if (typeof document === 'undefined') return;
  if (depth === 0) {
    const body = document.body;
    original = body.style.overflow;
    originalPad = body.style.paddingRight;
    const barWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (barWidth > 0) body.style.paddingRight = `${barWidth}px`;
  }
  depth += 1;
}

export function unlockScroll(): void {
  if (typeof document === 'undefined') return;
  if (depth === 0) return;
  depth -= 1;
  if (depth > 0) return;
  document.body.style.overflow = original;
  document.body.style.paddingRight = originalPad;
}

/** 테스트용. 열린 채로 끝난 테스트가 잠금을 흘리지 않게 한다. */
export function resetScrollLock(): void {
  depth = 0;
  original = '';
  originalPad = '';
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }
}
