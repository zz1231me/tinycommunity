// client/src/components/attendance/CheckInDialog.tsx
// 출근을 찍기 전에 확인 항목에 답하는 대화상자.
//
// 필수 항목이 남아 있으면 버튼을 막되, 무엇이 남았는지도 함께 적는다.
// 버튼만 비활성으로 두면 왜 안 눌리는지 알 수 없다.

import { useMemo, useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import type { ChecklistItem } from '../../types/attendance.types';

interface Props {
  items: ChecklistItem[];
  /** 필수 항목을 다 체크해야 출근이 되는지 */
  requireChecklist: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    responses: Array<{ itemId: number; checked: boolean }>;
    note: string;
  }) => void;
}

export function CheckInDialog({
  items,
  requireChecklist,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState('');

  const pending = useMemo(
    () => items.filter(item => item.required && !checked[item.id]),
    [items, checked]
  );
  const blocked = requireChecklist && pending.length > 0;

  const toggle = (id: number) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  const submit = () => {
    if (blocked || submitting) return;
    onSubmit({
      responses: items.map(item => ({ itemId: item.id, checked: Boolean(checked[item.id]) })),
      note: note.trim(),
    });
  };

  return (
    <ModalShell label="출근 확인" onClose={onClose} className="w-full max-w-lg">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <ShieldCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        <h2 className="card-title">출근 전 확인</h2>
      </div>

      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            확인할 항목이 없습니다. 그대로 출근을 기록합니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map(item => {
              const on = Boolean(checked[item.id]);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={on}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      on
                        ? 'border-primary-500 bg-primary-50 dark:border-primary-500/60 dark:bg-primary-500/10'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                        on
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-800 dark:text-slate-100">
                        {item.label}
                        {item.required && (
                          <span className="ml-1.5 text-xs text-rose-500">필수</span>
                        )}
                      </span>
                      {item.description && (
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            남길 말 (선택)
          </span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="늦은 사유나 전달 사항이 있으면 적어 주세요."
            className="input w-full resize-none"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <p className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
          {blocked
            ? `아직 확인하지 않은 항목이 ${pending.length}개 있습니다.`
            : '확인한 내용은 기록에 그대로 남습니다.'}
        </p>
        <div className="flex flex-shrink-0 gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={blocked || submitting}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '기록 중...' : '출근하기'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
