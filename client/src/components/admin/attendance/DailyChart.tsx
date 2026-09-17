// client/src/components/admin/attendance/DailyChart.tsx
// 한 사람의 기간 안 날짜별 근무 시간.
//
// 기록이 없는 날도 빈 칸으로 둔다. 기록 있는 날만 붙여 그리면 주말·결근이 사라져
// 막대가 촘촘히 붙고, 언제 비었는지가 안 보인다.

import { useMemo } from 'react';
import { formatDay, formatMinutes, shiftDay, weekdayOf } from '../../../utils/attendance';
import type { AttendanceRecord } from '../../../types/attendance.types';

interface Props {
  records: AttendanceRecord[];
  from: string;
  to: string;
  standardWorkMinutes: number;
}

/** 칸이 이보다 많으면 막대가 선처럼 가늘어져 읽히지 않는다 */
const MAX_SLOTS = 366;

export function DailyChart({ records, from, to, standardWorkMinutes }: Props) {
  const days = useMemo(() => {
    const byDay = new Map(records.map(r => [r.workDate, r]));
    const list: Array<{ day: string; record: AttendanceRecord | undefined }> = [];
    for (let day = from; day <= to && list.length < MAX_SLOTS; day = shiftDay(day, 1)) {
      list.push({ day, record: byDay.get(day) });
    }
    return list;
  }, [records, from, to]);

  if (days.length < 2) return null;

  // 눈금 위쪽에 여유를 둔다. 기준과 최대값이 같으면 기준선이 맨 위 테두리에 붙어
  // 선인지 테두리인지 구분되지 않고, 기준만큼 일한 날의 막대도 천장에 닿는다.
  const longest = Math.max(standardWorkMinutes, ...days.map(d => d.record?.workMinutes ?? 0));
  const peak = longest * 1.1;
  const standardAt = (standardWorkMinutes / peak) * 100;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">날짜별 근무 시간</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          점선 = 기준 {formatMinutes(standardWorkMinutes)}
        </span>
      </div>
      <div className="relative flex h-24 items-end gap-px">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-400 dark:border-slate-500"
          style={{ bottom: `${standardAt}%` }}
          aria-hidden="true"
        />
        {days.map(({ day, record }) => {
          const minutes = record?.workMinutes ?? null;
          const label = !record
            ? '기록 없음'
            : minutes === null
              ? '퇴근 안 찍음'
              : formatMinutes(minutes);
          return (
            <div
              key={day}
              className="group flex h-full flex-1 flex-col justify-end"
              title={`${formatDay(day)}(${weekdayOf(day)}) · ${label}`}
            >
              {record &&
                (minutes === null ? (
                  // 시간이 안 잡힌 날은 높이가 없다 — 바닥에 표시만 남긴다
                  <div className="h-1 rounded-sm bg-amber-400 dark:bg-amber-500" />
                ) : (
                  <div
                    className="rounded-sm bg-primary-500/70 group-hover:bg-primary-600"
                    style={{ height: `${Math.max(3, (minutes / peak) * 100)}%` }}
                  />
                ))}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-slate-400">
        <span>{formatDay(days[0].day)}</span>
        <span>{formatDay(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}
