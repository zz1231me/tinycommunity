// 되돌리기 어려운 일 앞에서 한 번 묻는다. window.confirm 대신 ModalShell 로 그려
// 포커스 가두기·ESC·다크 모드를 다른 대화상자와 똑같이 받는다.
//
//   const { confirm, dialog } = useConfirm();
//   if (!(await confirm({ title: '삭제할까요?', confirmLabel: '삭제', danger: true }))) return;
//   ...
//   return <>{...}{dialog}</>;

import { useCallback, useRef, useState } from 'react';
import { ModalShell } from '../components/common/ModalShell';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제처럼 위험한 일이면 확인 단추를 붉게 */
  danger?: boolean;
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    // 이미 열려 있으면 앞의 질문은 취소로 끝낸다. 약속이 영영 풀리지 않으면 부른 쪽이 멈춘다.
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  };

  const dialog = options ? (
    <ModalShell label={options.title} onClose={() => settle(false)}>
      <div className="px-5 py-4">
        <h2 className="card-title">{options.title}</h2>
        {options.description && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{options.description}</p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <button type="button" onClick={() => settle(false)} className="btn-secondary">
          {options.cancelLabel ?? '취소'}
        </button>
        <button
          type="button"
          onClick={() => settle(true)}
          className={options.danger ? 'btn-danger' : 'btn-primary'}
        >
          {options.confirmLabel ?? '확인'}
        </button>
      </div>
    </ModalShell>
  ) : null;

  return { confirm, dialog };
}
