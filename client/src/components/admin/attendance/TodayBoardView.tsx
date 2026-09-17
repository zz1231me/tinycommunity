// client/src/components/admin/attendance/TodayBoardView.tsx
// 오늘 누가 나왔는지 한 화면에.
//
// 안 찍은 사람이 보여야 하므로 명단 전체를 놓고 상태별로 나눈다.

import { useMemo, useState } from 'react';
import type { TodayBoard, TodayRow, TodayState } from '../../../types/attendance.types';
import { formatClock, formatDay, formatMinutes } from '../../../utils/attendance';

const STATE_META: Record<TodayState, { label: string; dot: string; chip: string }> = {
  working: {
    label: '근무 중',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  done: {
    label: '퇴근',
    dot: 'bg-primary-500',
    chip: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300',
  },
  absent: {
    label: '미출근',
    dot: 'bg-slate-300 dark:bg-slate-600',
    chip: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
  },
};

/** 나온 사람을 위로 — 미출근이 앞을 채우면 오늘 상황이 안 보인다 */
const STATE_ORDER: Record<TodayState, number> = { working: 0, done: 1, absent: 2 };

const FILTERS: Array<{ id: TodayState | 'all'; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'working', label: '근무 중' },
  { id: 'done', label: '퇴근' },
  { id: 'absent', label: '미출근' },
];

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {value}명
      </p>
    </div>
  );
}

type TodaySort = 'state' | 'name' | 'minutes';

const SORT_LABELS: Array<{ key: TodaySort; label: string }> = [
  { key: 'state', label: '상태순' },
  { key: 'minutes', label: '근무 시간순' },
  { key: 'name', label: '이름순' },
];

export function TodayBoardView({
  board,
  onSelectUser,
}: {
  board: TodayBoard;
  /** 이름을 누르면 그 사람의 기간별 기록으로 들어간다 */
  onSelectUser: (userId: string) => void;
}) {
  const [filter, setFilter] = useState<TodayState | 'all'>('all');
  const [sort, setSort] = useState<TodaySort>('state');

  const counts = useMemo(
    () => ({
      working: board.rows.filter(r => r.state === 'working').length,
      done: board.rows.filter(r => r.state === 'done').length,
      absent: board.rows.filter(r => r.state === 'absent').length,
    }),
    [board.rows]
  );

  const rows = useMemo(() => {
    const list = board.rows.filter(r => filter === 'all' || r.state === filter);
    const byName = (a: TodayRow, b: TodayRow) => a.userName.localeCompare(b.userName);
    if (sort === 'name') return [...list].sort(byName);
    if (sort === 'minutes') {
      // 오래 일한 사람부터. 안 찍은 사람은 뒤로 — 0분과 섞이면 순서가 뒤엉킨다.
      return [...list].sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1) || byName(a, b));
    }
    return [...list].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || byName(a, b));
  }, [board.rows, filter, sort]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card label="근무 중" value={counts.working} tone={STATE_META.working.dot} />
        <Card label="퇴근" value={counts.done} tone={STATE_META.done.dot} />
        <Card label="미출근" value={counts.absent} tone={STATE_META.absent.dot} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              filter === f.id
                ? 'bg-slate-800 font-medium text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}

        <span className="ml-auto flex items-center gap-1">
          {SORT_LABELS.map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSort(option.key)}
              aria-pressed={sort === option.key}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                sort === option.key
                  ? 'bg-slate-800 font-medium text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          해당하는 사람이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(row => {
            const meta = STATE_META[row.state];
            return (
              <li key={row.userId} className="flex items-center gap-3 py-2.5">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => onSelectUser(row.userId)}
                  title={`${row.userName}님의 기록 보기`}
                  className="min-w-0 flex-1 truncate text-left text-sm text-slate-800 hover:text-primary-600 hover:underline dark:text-slate-200 dark:hover:text-primary-400"
                >
                  {row.userName}
                  <span className="ml-1.5 text-xs text-slate-400">{row.userId}</span>
                </button>

                {row.state === 'absent' ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${meta.chip}`}>
                    {meta.label}
                  </span>
                ) : (
                  <>
                    <span className="hidden text-xs tabular-nums text-slate-500 sm:inline dark:text-slate-400">
                      {/* 어제부터 이어지는 근무는 시각만으로 구분되지 않는다 */}
                      {row.workDate && row.workDate !== board.workDate && (
                        <span className="mr-1 text-amber-600 dark:text-amber-400">
                          {formatDay(row.workDate)}
                        </span>
                      )}
                      {formatClock(row.checkInAt)}
                      {' → '}
                      {row.checkOutAt ? formatClock(row.checkOutAt) : '—'}
                    </span>
                    <span className="w-20 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMinutes(row.minutes)}
                    </span>
                    <span className="w-10 text-right text-xs text-slate-400">
                      {row.checklistCount > 0 ? `${row.checkedCount}/${row.checklistCount}` : '—'}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
