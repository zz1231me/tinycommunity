// client/src/components/admin/attendance/SummaryChart.tsx
// 인원별 하루 평균을 가로 막대로 본다.
//
// 표의 숫자만으로는 누가 길고 누가 짧은지 한눈에 안 들어온다. 기준 근무 시간을
// 눈금으로 세워 두면 "기준을 넘겼는가" 가 위치만으로 읽힌다.

import { formatMinutes } from '../../../utils/attendance';
import type { AttendanceSummaryRow } from '../../../types/attendance.types';

interface Props {
  rows: AttendanceSummaryRow[];
  standardWorkMinutes: number;
}

/** 막대 눈금의 최대치 — 기준과 실제 중 큰 쪽에 여유를 준다 */
function scaleMax(rows: AttendanceSummaryRow[], standard: number): number {
  const longest = Math.max(0, ...rows.map(r => r.averageMinutes));
  return Math.max(standard, longest) * 1.1 || 1;
}

export function SummaryChart({ rows, standardWorkMinutes }: Props) {
  const worked = rows.filter(r => r.days > 0);
  if (worked.length === 0) return null;

  const max = scaleMax(worked, standardWorkMinutes);
  const standardAt = (standardWorkMinutes / max) * 100;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">하루 평균 근무</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          점선 = 기준 {formatMinutes(standardWorkMinutes)}
        </span>
      </div>

      <div className="relative space-y-1.5">
        {/* 기준선 — 막대 뒤로 세로로 지난다 */}
        <div
          className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-400 dark:border-slate-500"
          style={{ left: `calc(7rem + (100% - 7rem) * ${standardAt / 100})` }}
          aria-hidden="true"
        />
        {worked.map(row => {
          const pct = Math.min(100, (row.averageMinutes / max) * 100);
          const over = row.averageMinutes >= standardWorkMinutes;
          return (
            <div key={row.userId} className="flex items-center gap-2 text-xs">
              <span
                className="w-28 flex-shrink-0 truncate text-slate-600 dark:text-slate-300"
                title={`${row.userName} (${row.userId})`}
              >
                {row.userName}
              </span>
              <span className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                <span
                  className={`block h-full rounded transition-[width] ${
                    over ? 'bg-primary-500' : 'bg-primary-400/60'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-20 flex-shrink-0 text-right tabular-nums text-slate-600 dark:text-slate-400">
                {formatMinutes(row.averageMinutes)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
