// client/src/components/common/ModalShell.tsx
// 모달의 공통 뼈대 — 덮개, 바깥 클릭으로 닫기, ESC, 포커스 가두기·되돌리기.
//
// 다이얼로그마다 각자 구현하면 ESC·포커스 처리가 화면별로 갈린다.
//
// ConfirmationModal 을 재사용하지 않는다. 그쪽은 제목·메시지·확인/취소가 고정된
// 확인 대화상자라 임의 내용을 담을 수 없다.

import { useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  /** 스크린리더가 읽을 대화상자 이름 */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 화면 위쪽에 붙일지 (검색처럼 목록이 길어지는 경우) */
  align?: 'center' | 'top';
  className?: string;
}

export function ModalShell({
  label,
  onClose,
  children,
  align = 'center',
  className = 'w-full max-w-md',
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 가두기·되돌리기·ESC 는 훅 하나에 모여 있다. 손으로 만든 오버레이들도 같은 것을 쓴다.
  useFocusTrap(panelRef, onClose);

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
