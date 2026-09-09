// client/src/components/boards/WorkStatusFilter.tsx
// 업무 상태로 목록을 좁히는 줄.
//
// 여러 개를 함께 고를 수 있다. '할 일 + 진행 중'(아직 안 끝난 것) 조합이 필요한데
// 단일 선택으로는 만들 수 없다.
//
// '없음'(none) 은 고를 수 없다. 업무로 추적하지 않는 글만 모아 보는 것은 사실상
// '전체' 와 같다.

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

      {/* 이어 붙인 분할 컨트롤. 낱개 알약을 늘어놓는 것보다 "한 벌의 선택지" 로 읽히고,
          같은 줄에 놓이는 태그 칩과도 구분된다. */}
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
