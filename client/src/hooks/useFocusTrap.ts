// client/src/hooks/useFocusTrap.ts
// 대화상자 안에 포커스를 가두고, 닫을 때 원래 자리로 되돌린다.
//
// ModalShell 안에만 있던 로직을 꺼냈다. 화면마다 손으로 만든 오버레이가 여럿인데,
// 거기에 같은 코드를 열한 번 복사해 넣는 대신 이 훅 하나를 쓰게 한다.
//
// 가두지 않으면 Tab 이 대화상자 밖으로 새어, 뒤에 가려진 화면의 버튼을 누르게 된다.
// 키보드만 쓰는 사람에게는 "닫지 않았는데 다른 곳이 눌리는" 상태가 된다.

import { useEffect, useRef, type RefObject } from 'react';

/** 이 안에서 Tab 으로 갈 수 있는 요소들 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param panelRef 대화상자 바깥 상자. 이 안쪽만 포커스가 돈다.
 * @param onClose  ESC 를 눌렀을 때 부를 것
 * @param active   열려 있을 때만 건다. 닫힌 채로 걸어 두면 ESC 가 엉뚱하게 먹는다.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true
): void {
  // onClose 를 ref 로 둔다 — 부모가 인라인 화살표로 넘겨도 effect 가 매 렌더마다
  // 정리·재설치되지 않게 한다. 재설치되면 열어 둔 사이에 포커스가 첫 요소로 튄다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 첫 포커스는 안쪽 첫 요소로 — 열자마자 바로 쓸 수 있어야 한다
    const t = setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
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
      document.removeEventListener('keydown', onKey);
      // 열기 전에 보던 자리로 되돌린다.
      // 이미 문서에서 떨어진 요소면 focus() 가 아무 일도 하지 않으므로 먼저 확인한다 —
      // 그냥 부르면 포커스가 body 로 떨어져 키보드 사용자가 처음부터 다시 Tab 해야 한다.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [active, panelRef]);
}
