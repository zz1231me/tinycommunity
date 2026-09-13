// client/src/components/attendance/MonthChart.tsx
// 그 달의 일별 근무 시간 막대.
//
// 표만 있으면 "요즘 어땠는지" 를 읽어 내려면 숫자를 하나씩 봐야 한다.

import { daysInMonth, formatMinutes } from '../../utils/attendance';
import type { AttendanceRecord } from '../../types/attendance.types';

interface Props {
  month: string;
  records: AttendanceRecord[];
  standardWorkMinutes: number;
  /** 지금 이어지고 있는 기록의 날짜. 퇴근이 없는 날이 '근무 중' 인지 '안 찍은 날' 인지 가른다. */
  liveWorkDate: string;
}

export function MonthChart({ month, records, standardWorkMinutes, liveWorkDate }: Props) {
  const total = daysInMonth(month);
  const byDay = new Map(records.map(r => [Number(r.workDate.slice(8, 10)), r]));
  // 기준 시간을 넘긴 날이 있으면 그 날에 맞춰 눈금을 늘린다
  const peak = Math.max(
    standardWorkMinutes,
    ...records.map(r => r.workMinutes ?? 0)
  );

  return (
    <div className="px-4 pb-4">
      <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={`${month} 일별 근무 시간`}>
        {Array.from({ length: total }, (_, i) => i + 1).map(day => {
          const record = byDay.get(day);
          const minutes = record?.workMinutes ?? 0;
          const open = Boolean(record && record.workMinutes === null);
          // 지난 날의 열린 기록은 근무 중이 아니라 퇴근을 안 찍은 것이다
          const working = open && record?.workDate === liveWorkDate;
          const height = minutes > 0 ? Math.max(4, Math.round((minutes / peak) * 100)) : 0;

          return (
            <div
              key={day}
              className="group relative flex flex-1 flex-col justify-end"
              title={
                record
                  ? `${day}일 · ${open ? (working ? '근무 중' : '퇴근 안 찍음') : formatMinutes(minutes)}`
                  : `${day}일 · 기록 없음`
              }
            >
              {open ? (
                <div className={`h-1.5 rounded-sm ${working ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              ) : height > 0 ? (
                <div
                  className="rounded-sm bg-primary-500/80 group-hover:bg-primary-600"
                  style={{ height: `${height}%` }}
                />
              ) : (
                <div className="h-1 rounded-sm bg-slate-100 dark:bg-slate-800" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-slate-400">
        <span>1일</span>
        <span>{total}일</span>
      </div>
    </div>
  );
}
