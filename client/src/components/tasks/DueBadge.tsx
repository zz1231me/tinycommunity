// 마감까지 남은 날. 지난 것은 붉게, 오늘·곧은 주황으로 칠해 눈에 먼저 들어오게 한다.

import type { MyTask } from '../../api/tasks';
import { useSiteSettings } from '../../store/siteSettings';
import { dueInfo, type DueTone } from './taskViews';

const TONE: Record<DueTone, string> = {
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  // 밝은 테마에서 orange-700 은 4.28:1 로 AA(작은 글자 4.5:1)에 못 미쳤다. 한 단계 진하게 — 6.05:1.
  today: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  soon: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  later: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export function DueBadge({
  task,
  today,
}: {
  task: Pick<MyTask, 'dueDate' | 'workStatus'>;
  today: Date;
}) {
  // '곧' 으로 칠할 기준은 관리자가 정한다(사이트 설정 › 업무).
  const soonDays = useSiteSettings(s => s.settings.taskSoonDays);
  const info = dueInfo(task, today, soonDays);
  if (!info) return null;
  return (
    <span
      title={`마감 ${task.dueDate}`}
      className={`inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-2xs font-semibold tabular-nums ${TONE[info.tone]}`}
    >
      {info.label}
    </span>
  );
}
