// 업무 거르기 줄. 보는 범위(내 업무·게시판), 제목 검색, 게시판, 마감 요약, 정렬.

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { TaskBoard } from '../../api/tasks';
import { useFeature } from '../../store/features';
import { PRIORITY_LABEL, TASK_PRIORITIES, isTaskPriority } from './taskPriority';
import {
  SHARED_SCOPE,
  DUE_FILTERS,
  TASK_SORTS,
  type DueFilter,
  type TaskFilter,
  type TaskSort,
} from './taskViews';

const DUE_TONE: Record<DueFilter, string> = {
  overdue: 'text-rose-600 dark:text-rose-400',
  today: 'text-orange-600 dark:text-orange-400',
  week: 'text-amber-600 dark:text-amber-400',
};

interface Props {
  /** '' 이면 내 업무, 아니면 그 게시판의 팀 보기 */
  scope: string;
  scopes: TaskBoard[];
  onScopeChange: (scope: string) => void;
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
  /** 내 업무에서 고를 수 있는 게시판(지금 목록에 있는 것만) */
  boards: TaskBoard[];
  dueCounts: Record<DueFilter, number>;
  /** 저장된 필터 고르기. 거르는 줄의 맨 앞에 선다. */
  savedFilters?: ReactNode;
  /** 목록 보기에서만 정렬을 고른다 */
  sort?: TaskSort;
  onSortChange?: (sort: TaskSort) => void;
}

export function TaskFilters({
  scope,
  scopes,
  onScopeChange,
  filter,
  onFilterChange,
  boards,
  dueCounts,
  savedFilters,
  sort,
  onSortChange,
}: Props) {
  const set = (patch: Partial<TaskFilter>) => onFilterChange({ ...filter, ...patch });
  const sharedAllowed = useFeature('post.tasksShared');

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {savedFilters}
        {scopes.length > 0 && (
          <select
            aria-label="보는 범위"
            value={scope}
            onChange={e => onScopeChange(e.target.value)}
            className="input w-auto py-1.5 text-sm"
          >
            <option value="">내 업무</option>
            {/* 공유 보기. 꺼져 있으면 고를 수 없고, 서버도 그 길을 막는다. */}
            {sharedAllowed && <option value={SHARED_SCOPE}>전체 업무</option>}
            {scopes.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} 전체
              </option>
            ))}
          </select>
        )}
        <label className="relative min-w-[10rem] flex-1">
          <span className="sr-only">제목 검색</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filter.query}
            onChange={e => set({ query: e.target.value })}
            placeholder="제목으로 찾기"
            className="input w-full py-1.5 pl-8 text-sm"
          />
        </label>
        {!scope && boards.length > 1 && (
          <select
            aria-label="게시판"
            value={filter.boardType}
            onChange={e => set({ boardType: e.target.value })}
            className="input w-auto py-1.5 text-sm"
          >
            <option value="">모든 게시판</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="우선순위"
          value={filter.priority ?? ''}
          onChange={e => set({ priority: isTaskPriority(e.target.value) ? e.target.value : null })}
          className="input w-auto py-1.5 text-sm"
        >
          <option value="">모든 우선순위</option>
          {[...TASK_PRIORITIES].reverse().map(p => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        {sort && onSortChange && (
          <select
            aria-label="정렬"
            value={sort}
            onChange={e => onSortChange(e.target.value as TaskSort)}
            className="input w-auto py-1.5 text-sm"
          >
            {TASK_SORTS.map(s => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 마감 요약. 누르면 그 조건으로 좁히고, 다시 누르면 푼다. */}
      <div role="group" aria-label="마감으로 거르기" className="flex flex-wrap gap-2">
        {DUE_FILTERS.map(f => {
          const active = filter.due === f.key;
          const count = dueCounts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              // 0 건인 조건은 눌러도 빈 화면이 된다. 자리는 지키되(칸이 움직이지 않게)
              // 흐리게 두고 누르지 못하게 한다.
              disabled={count === 0 && !active}
              onClick={() => set({ due: active ? null : f.key })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-45 ${
                active
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-500/10 dark:text-primary-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:disabled:hover:bg-slate-800'
              }`}
            >
              {f.label}{' '}
              <span className={`tabular-nums ${count > 0 && !active ? DUE_TONE[f.key] : ''}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
