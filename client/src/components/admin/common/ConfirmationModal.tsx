import React, { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFocusTrap } from '../../../hooks/useFocusTrap';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 확인 버튼 색상 — 기본 red (삭제), blue (일반 확인) */
  variant?: 'danger' | 'primary';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
  variant = 'danger',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // 접근성: ESC로 닫기, 모달 안에서 Tab 순환(focus trap), 첫 포커스를 취소 버튼으로,
  // 닫힐 때 이전 포커스 복원.
  //
  // 같은 일을 하던 손코드를 공용 훅으로 바꿨다. 동작은 그대로다 — 이 패널 안에서
  // 포커스를 받는 것은 단추 둘뿐이라(제목·본문은 글자고 message 는 문자열 prop),
  // '단추 둘만 순환' 과 '안쪽 전부 순환' 이 지금은 같은 뜻이다. 바뀌는 것은 사본이
  // 하나 줄고, 테스트가 붙어 있는 쪽으로 합쳐진다는 점이다.
  //
  // 첫 포커스는 취소로 못 박는다. 훅 기본값(안쪽 첫 요소)도 지금은 취소지만,
  // 위험한 확인에서 그것이 단추 순서에 딸려 바뀌게 두면 안 된다.
  useFocusTrap(panelRef, onCancel, open, cancelBtnRef);

  const confirmCls =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-primary-600 hover:bg-primary-700 text-white';

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center modal-scrim"
          onClick={onCancel}
          role="presentation"
        >
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmation-modal-title"
            aria-describedby={message ? 'confirmation-modal-desc' : undefined}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="confirmation-modal-title" className="card-title mb-2">
              {title}
            </h3>
            {message && (
              <p
                id="confirmation-modal-desc"
                className="text-sm text-slate-500 dark:text-slate-400 mb-5"
              >
                {message}
              </p>
            )}
            <div className={`flex justify-end gap-2 ${message ? '' : 'mt-5'}`}>
              <button
                ref={cancelBtnRef}
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 text-sm rounded-lg font-medium focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 transition-colors ${confirmCls}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
