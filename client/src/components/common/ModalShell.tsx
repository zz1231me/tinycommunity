// client/src/components/common/ModalShell.tsx
// 모달의 공통 뼈대 — 덮개, 바깥 클릭으로 닫기, ESC, 포커스 가두기·되돌리기.
//
// 다이얼로그마다 각자 구현하면 ESC·포커스 처리가 화면별로 갈린다.
//
// ConfirmationModal 을 재사용하지 않는다. 그쪽은 제목·메시지·확인/취소가 고정된
// 확인 대화상자라 임의 내용을 담을 수 없다.

import { useEffect, useRef } from 'react';

interface Props {
  /** 스크린리더가 읽을 대화상자 이름 */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 화면 위쪽에 붙일지 (검색처럼 목록이 길어지는 경우) */
  align?: 'center' | 'top';
  className?: string;
}

/** 이 안에서 Tab 으로 갈 수 있는 요소들 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalShell({
  label,
  onClose,
  children,
  align = 'center',
  className = 'w-full max-w-md',
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose 를 ref 로 둔다 — 부모가 인라인 화살표로 넘겨도 effect 가 매 렌더마다
  // 정리·재설치되지 않게 (ConfirmationModal 과 같은 이유)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 첫 포커스는 안쪽 첫 요소로 — 열자마자 바로 타이핑할 수 있어야 한다
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

      // 모달 밖으로 Tab 이 새면 뒤에 가려진 화면을 조작하게 된다
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
      // 열기 전에 보던 자리로 되돌린다
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/40 p-4 ${
        align === 'top' ? 'items-start pt-24' : 'items-center'
      }`}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
