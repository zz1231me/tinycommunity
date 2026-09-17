// client/src/components/attendance/MonthChart.tsx
// 그 달의 일별 근무 시간 막대.
//
// 표만으로는 한 달 흐름이 한눈에 들어오지 않는다.
//
// 세 가지를 관리자 화면(DailyChart)과 맞췄다.
//  - 눈금에 여유를 둔다. 여유가 없으면 가장 긴 날의 막대가 천장에 붙어 선인지
//    테두리인지 구분되지 않는다.
//  - 기준 근무 시간을 점선으로 얹는다. '오늘 채웠나' 를 막대 높이만으로는 알 수 없다.
//  - 주말을 옅게 구분한다. 막대 30개가 균질하게 늘어서면 주 단위가 안 읽힌다.
//
// 값은 마우스(title) 뿐 아니라 화면 낭독기에도 전한다 — 예전에는 그림 하나로만
// 노출돼 날짜별 수치가 보조기기에 전혀 닿지 않았다.

import { daysInMonth, formatMinutes } from '../../utils/attendance';
import type { AttendanceRecord } from '../../types/attendance.types';

interface Props {
  month: string;
  records: AttendanceRecord[];
  standardWorkMinutes: number;
  /** 지금 이어지고 있는 기록의 날짜. 퇴근이 없는 날이 '근무 중' 인지 '안 찍은 날' 인지 가른다. */
  liveWorkDate: string;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function MonthChart({ month, records, standardWorkMinutes, liveWorkDate }: Props) {
  const total = daysInMonth(month);
  const byDay = new Map(records.map(r => [Number(r.workDate.slice(8, 10)), r]));

  // 기준과 실제 중 큰 쪽에 여유를 둔다
  const longest = Math.max(standardWorkMinutes, ...records.map(r => r.workMinutes ?? 0));
  const peak = longest * 1.1 || 1;
  const standardAt = (standardWorkMinutes / peak) * 100;

  const days = Array.from({ length: total }, (_, i) => i + 1).map(day => {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const record = byDay.get(day);
    const minutes = record?.workMinutes ?? null;
    const open = Boolean(record && record.workMinutes === null);
    // 지난 날의 열린 기록은 근무 중이 아니라 퇴근을 안 찍은 것이다
    const working = open && record?.workDate === liveWorkDate;
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const label = !record
      ? '기록 없음'
      : open
        ? working
          ? '근무 중'
          : '퇴근 안 찍음'
        : formatMinutes(minutes);
    return { day, date, record, minutes, open, working, weekday, label };
  });

  return (
    <div className="px-4 pb-4">
      <div className="mb-1.5 flex items-center justify-between text-2xs text-slate-400">
        <span>1일</span>
        <span>점선 = 기준 {formatMinutes(standardWorkMinutes)}</span>
        <span>{total}일</span>
      </div>

      <div className="relative flex h-24 items-end gap-[3px]" aria-hidden="true">
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-400 dark:border-slate-500"
          style={{ bottom: `${standardAt}%` }}
        />
        {days.map(({ day, minutes, open, working, weekday, label }) => {
          const height =
            minutes && minutes > 0 ? Math.max(4, Math.round((minutes / peak) * 100)) : 0;
          const weekend = weekday === 0 || weekday === 6;
          return (
            <div
              key={day}
              className={`group relative flex h-full flex-1 flex-col justify-end rounded-sm ${
                weekend ? 'bg-slate-50 dark:bg-slate-800/40' : ''
              }`}
              title={`${day}일(${WEEKDAYS[weekday]}) · ${label}`}
            >
              {open ? (
                <div
                  className={`h-1.5 rounded-sm ${working ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
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

      {/* 낭독기에는 그림 대신 값을 그대로 읽어 준다 */}
      <ul className="sr-only">
        {days
          .filter(d => d.record)
          .map(({ day, weekday, label }) => (
            <li key={day}>{`${day}일 ${WEEKDAYS[weekday]}요일 ${label}`}</li>
          ))}
      </ul>
    </div>
  );
}
