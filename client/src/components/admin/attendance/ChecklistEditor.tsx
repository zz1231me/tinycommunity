// 출근 확인 항목 편집. 입력칸은 항상 서버 값과 맞춘다.

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ChecklistItem } from '../../../types/attendance.types';

interface RowProps {
  item: ChecklistItem;
  first: boolean;
  last: boolean;
  onPatch: (data: Partial<ChecklistItem>) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}

function ChecklistRow({ item, first, last, onPatch, onMove, onDelete }: RowProps) {
  const [label, setLabel] = useState(item.label);
  const [description, setDescription] = useState(item.description);

  // 저장 성공·실패와 무관하게 서버 값이 바뀌면 화면을 그 값으로 되돌린다.
  useEffect(() => setLabel(item.label), [item.label]);
  useEffect(() => setDescription(item.description), [item.description]);

  const commit = (field: 'label' | 'description', value: string) => {
    const next = value.trim();
    if (field === 'label' && !next) {
      setLabel(item.label);
      return;
    }
    if (next === item[field]) return;
    onPatch({ [field]: next });
  };

  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-colors ${
        item.isActive
          ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60'
          : 'border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5 pt-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label="위로"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-25 dark:hover:bg-slate-700"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label="아래로"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-25 dark:hover:bg-slate-700"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={e => commit('label', e.target.value)}
            maxLength={200}
            aria-label="항목 내용"
            className="input input-sm w-full font-medium"
          />
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={e => commit('description', e.target.value)}
            maxLength={500}
            placeholder="설명 (선택) — 항목 아래에 작게 표시됩니다."
            aria-label="항목 설명"
            className="input input-sm w-full"
          />
        </div>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`${item.label} 삭제`}
          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 pl-7">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={item.required}
            onChange={e => onPatch({ required: e.target.checked })}
          />
          체크해야 출근 가능
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={item.isActive}
            onChange={e => onPatch({ isActive: e.target.checked })}
          />
          사용
          {!item.isActive && <span className="text-slate-400">— 새 출근에 표시 안 됨</span>}
        </label>
      </div>
    </div>
  );
}

interface Props {
  items: ChecklistItem[];
  adding: boolean;
  onAdd: (data: { label: string; description: string; required: boolean }) => void;
  onPatch: (id: number, data: Partial<ChecklistItem>) => void;
  onReorder: (ids: number[]) => void;
  onDelete: (item: ChecklistItem) => void;
}

export function ChecklistEditor({ items, adding, onAdd, onPatch, onReorder, onDelete }: Props) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(true);

  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next.map(i => i.id));
  };

  const submit = () => {
    if (!label.trim() || adding) return;
    onAdd({ label, description, required });
    setLabel('');
    setDescription('');
  };

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          확인 항목이 없습니다. 출근을 누르면 바로 기록됩니다.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <ChecklistRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === items.length - 1}
              onPatch={data => onPatch(item.id, data)}
              onMove={delta => move(index, delta)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              항목 내용
            </span>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => !e.nativeEvent.isComposing && e.key === 'Enter' && submit()}
              maxLength={200}
              placeholder="예) 보안 수칙을 확인했습니다."
              className="input input-sm w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              설명 (선택)
            </span>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => !e.nativeEvent.isComposing && e.key === 'Enter' && submit()}
              maxLength={500}
              placeholder="항목 아래에 작게 표시됩니다."
              className="input input-sm w-full"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={required}
              onChange={e => setRequired(e.target.checked)}
            />
            체크해야 출근할 수 있는 필수 항목
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={!label.trim() || adding}
            className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
