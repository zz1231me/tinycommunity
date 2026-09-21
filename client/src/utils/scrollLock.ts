// 대화상자가 열린 동안 뒤 화면 스크롤을 막는다.
// 여러 곳이 겹쳐 잠그므로 세어 두고, 처음 잠글 때만 원래 값을 기억해 마지막에 되돌린다.

let depth = 0;
let original = '';

export function lockScroll(): void {
  if (typeof document === 'undefined') return;
  if (depth === 0) {
    original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  depth += 1;
}

/** @returns 마지막 하나가 풀려 배경이 다시 스크롤되는가 */
export function unlockScroll(): boolean {
  if (typeof document === 'undefined') return false;
  if (depth === 0) return false;
  depth -= 1;
  if (depth > 0) return false;
  document.body.style.overflow = original;
  return true;
}

/** 테스트용. 열린 채로 끝난 테스트가 잠금을 흘리지 않게 한다. */
export function resetScrollLock(): void {
  depth = 0;
  original = '';
  if (typeof document !== 'undefined') document.body.style.overflow = '';
}
