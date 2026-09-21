// client/src/utils/scrollLock.ts
// 대화상자가 열려 있는 동안 뒤 화면이 스크롤되지 않게 한다.
//
// 세 곳이 각자 document.body.style.overflow 를 만지고 있었다. 각자 하면 겹칠 때 어긋난다 —
// 바깥 상자가 잠근 'hidden' 을 안쪽 상자가 '원래 값' 으로 기억했다가, 안쪽만 닫혔는데
// 되돌려 놓아 버리거나(뒤가 스크롤됨) 반대로 잠금이 영영 남는다(닫았는데 스크롤이 안 됨).
//
// 그래서 세어 둔다. 처음 잠글 때만 원래 값을 기억하고, 마지막 하나가 풀릴 때만 되돌린다.

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

/** 테스트용 — 열린 채로 끝난 테스트가 다음 테스트로 잠금을 흘리지 않게 */
export function resetScrollLock(): void {
  depth = 0;
  original = '';
  if (typeof document !== 'undefined') document.body.style.overflow = '';
}
