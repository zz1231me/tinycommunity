import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useFocusTrap } from '../../../hooks/useFocusTrap';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 확인을 눌렀을 때. Promise 를 돌려주면 끝날 때까지 단추를 잠가 둔다 */
  onConfirm: () => unknown | Promise<unknown>;
  onCancel: () => void;
  /** 확인 버튼 색상. danger 는 빨강(삭제), primary 는 파랑 */
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
  // 확인은 한 번만. 응답이 오기 전에 두 번 누르면 같은 요청이 두 번 나간다.
  const [busy, setBusy] = useState(false);
  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // ESC 닫기·포커스 트랩·포커스 복원. 첫 포커스는 단추 순서와 무관하게 취소로 못 박는다.
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
                onClick={handleConfirm}
                disabled={busy}
                className={`px-4 py-2 text-sm rounded-lg font-medium focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${confirmCls}`}
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
