// client/src/components/attendance/TodayHero.tsx
// 오늘 카드 — 지금 상태와 큰 숫자 하나.
//
// 화면 전체를 1초마다 다시 그리면 아래 표까지 함께 흔들린다.
// 흐르는 시간은 여기서만 세고, 부모는 다시 그리지 않는다.

import { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import type { AttendanceRecord } from '../../types/attendance.types';
import { formatClock, formatMinutes, minutesBetween } from '../../utils/attendance';

interface Props {
  workDate: string;
  record: AttendanceRecord | null;
  standardWorkMinutes: number;
  checkingOut: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
}

/** 분 단위로만 쓰므로 15초면 충분하다 */
const TICK_MS = 15_000;

function useTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function TodayHero({
  workDate,
  record,
  standardWorkMinutes,
  checkingOut,
  onCheckIn,
  onCheckOut,
}: Props) {
  const working = Boolean(record && !record.checkOutAt);
  // 퇴근까지 찍고 나면 더 셀 것이 없다
  const now = useTick(!record || working);

  const minutes = record
    ? working
      ? minutesBetween(record.checkInAt, now)
      : (record.workMinutes ?? 0)
    : 0;
  const percent = Math.min(100, Math.round((minutes / Math.max(1, standardWorkMinutes)) * 100));

  const state = !record ? 'before' : working ? 'working' : 'done';
  const badge = {
    before: { text: '출근 전', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    working: {
      text: '근무 중',
      cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    },
    done: {
      text: '퇴근 완료',
      cls: 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300',
    },
  }[state];

  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
              {badge.text}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{workDate}</span>
          </div>

          <p className="mt-2 text-4xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">
            {record ? formatMinutes(minutes) : clock}
          </p>

          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {record ? (
              <>
                출근 <span className="tabular-nums">{formatClock(record.checkInAt)}</span>
                {record.checkOutAt && (
                  <>
                    {' · '}퇴근{' '}
                    <span className="tabular-nums">{formatClock(record.checkOutAt)}</span>
                  </>
                )}
              </>
            ) : (
              '출근을 누르면 확인 항목이 뜹니다.'
            )}
          </p>
        </div>

        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={onCheckIn}
            disabled={Boolean(record)}
            className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LogIn className="h-4 w-4" />
            출근
          </button>
          <button
            type="button"
            onClick={onCheckOut}
            disabled={!working || checkingOut}
            className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LogOut className="h-4 w-4" />
            퇴근
          </button>
        </div>
      </div>

      {record && (
        <div className="px-5 pb-5">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>기준 {formatMinutes(standardWorkMinutes)}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="기준 근무 시간 대비 진행"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                working ? 'bg-emerald-500' : 'bg-primary-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
