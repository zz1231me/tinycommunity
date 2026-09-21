// 모달 공통 뼈대. 덮개, 바깥 클릭 닫기, ESC, 포커스 가두기·되돌리기를 맡는다.

import { useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  /** 스크린리더가 읽을 대화상자 이름 */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 화면 위쪽에 붙일지 여부 */
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
