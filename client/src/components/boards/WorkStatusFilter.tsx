// 업무 상태 필터. 여러 개를 함께 고를 수 있고 'none' 은 고를 수 없다.

import type { WorkStatus } from '../../api/tasks';

const OPTIONS: Array<{ key: Exclude<WorkStatus, 'none'>; label: string }> = [
  { key: 'todo', label: '할 일' },
  { key: 'doing', label: '진행 중' },
  { key: 'done', label: '완료' },
];

interface Props {
  selected: WorkStatus[];
  onChange: (next: WorkStatus[]) => void;
}

export function WorkStatusFilter({ selected, onChange }: Props) {
  const toggle = (key: WorkStatus) =>
    onChange(selected.includes(key) ? selected.filter(s => s !== key) : [...selected, key]);

  return (
    <div className="flex items-center gap-2" role="group" aria-label="업무 상태 필터">
      <span className="text-xs font-medium text-slate-400">상태</span>

      {/* 이어 붙인 분할 컨트롤로 한 벌의 선택지처럼 읽히게 한다. */}
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={selected.length === 0}
          className={`px-3 py-1 text-xs font-medium transition-colors ${
            selected.length === 0
              ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          전체
        </button>

        {OPTIONS.map(option => {
          const active = selected.includes(option.key);
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => toggle(option.key)}
              aria-pressed={active}
              className={`border-l border-slate-300 px-3 py-1 text-xs font-medium transition-colors dark:border-slate-600 ${
                active
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
