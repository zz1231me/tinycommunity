// client/src/components/admin/attendance/DailyChart.tsx
// 기간 안의 날짜별 근무 시간 합계.
//
// 표는 한 줄이 한 사람이라, 어느 날 다들 길게 일했는지가 안 보인다.

import { useMemo } from 'react';
import { formatDay, formatMinutes, weekdayOf } from '../../../utils/attendance';
import type { AttendanceRecord } from '../../../types/attendance.types';

interface Props {
  records: AttendanceRecord[];
}

export function DailyChart({ records }: Props) {
  const days = useMemo(() => {
    const byDay = new Map<string, { minutes: number; people: number }>();
    for (const r of records) {
      const cur = byDay.get(r.workDate) ?? { minutes: 0, people: 0 };
      cur.minutes += r.workMinutes ?? 0;
      cur.people += 1;
      byDay.set(r.workDate, cur);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [records]);

  if (days.length < 2) return null;

  const peak = Math.max(1, ...days.map(([, v]) => v.minutes));

  return (
    <div className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">
        날짜별 근무 합계
      </h3>
      <div className="flex h-20 items-end gap-1">
        {days.map(([day, v]) => (
          <div
            key={day}
            className="group flex flex-1 flex-col justify-end"
            title={`${formatDay(day)}(${weekdayOf(day)}) · ${v.people}명 · ${formatMinutes(v.minutes)}`}
          >
            <div
              className="rounded-sm bg-primary-500/70 group-hover:bg-primary-600"
              style={{ height: `${Math.max(3, (v.minutes / peak) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-slate-400">
        <span>{formatDay(days[0][0])}</span>
        <span>{formatDay(days[days.length - 1][0])}</span>
      </div>
    </div>
  );
}
