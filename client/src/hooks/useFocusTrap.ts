// 대화상자 안에 포커스를 가두고, 닫을 때 원래 자리로 되돌린다.

import { useEffect, useRef, type RefObject } from 'react';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

// 열려 있는 대화상자 목록. 맨 위 하나만 키를 받는다.
// '맨 위' 는 연 순서가 아니라 DOM 순서다(대화상자는 모두 같은 z-50 층).
const traps: { id: symbol; ref: RefObject<HTMLElement | null> }[] = [];

/** 지금 화면 맨 위에 그려진 대화상자 */
function topTrapId(): symbol | undefined {
  let top: { id: symbol; el: HTMLElement } | undefined;
  for (const t of traps) {
    const el = t.ref.current;
    if (!el) continue;
    // DOM 에서 뒤에 오거나 안에 들어 있으면 위에 그려진다(둘 다 FOLLOWING)
    if (!top || top.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
      top = { id: t.id, el };
    }
  }
  return top?.id;
}

/** 지금 열려 있는 대화상자가 하나라도 있는가 */
export function hasOpenDialog(): boolean {
  return traps.some(t => t.ref.current);
}

/** 이 요소가 지금 맨 위 대화상자인가. document 에 직접 키를 듣는 화면이 쓴다. */
export function isTopmostDialog(el: HTMLElement | null): boolean {
  if (traps.length === 0) return true;
  if (!el) return false;
  const top = topTrapId();
  return traps.some(t => t.id === top && t.ref.current === el);
}

/** 이 안에서 Tab 으로 갈 수 있는 요소들 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param panelRef 대화상자 바깥 상자. 이 안쪽만 포커스가 돈다.
 * @param onClose  ESC 를 눌렀을 때 부를 것
 * @param active   열려 있을 때만 건다. 닫힌 채로 걸어 두면 ESC 가 엉뚱하게 먹는다.
 * @param initialFocusRef 처음 포커스를 줄 곳. 안 주면 안쪽 첫 요소로 간다.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
  initialFocusRef?: RefObject<HTMLElement | null>
): void {
  // onClose 를 ref 로 둬야 인라인 화살표를 받아도 effect 가 매 렌더마다 재설치되지 않는다
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 이 훅 인스턴스를 쌓기 위한 표식
  const idRef = useRef(Symbol('focus-trap'));

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const id = idRef.current;
    traps.push({ id, ref: panelRef });

    lockScroll();

    // 첫 포커스는 지정한 곳, 없으면 안쪽 첫 요소로
    const t = setTimeout(() => {
      const target =
        initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      // 맨 위 대화상자만 키를 받는다
      if (topTrapId() !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      const at = traps.findIndex(entry => entry.id === id);
      if (at !== -1) traps.splice(at, 1);
      unlockScroll();
      document.removeEventListener('keydown', onKey);
      // 열기 전 자리로 되돌린다. 떨어져 나간 요소면 focus() 가 포커스를 body 로 보낸다.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [active, panelRef, initialFocusRef]);
}
