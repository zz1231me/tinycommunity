// 업무 우선순위. 서버 config/taskPriority.ts 와 키·순서를 맞춘다.
//
// 마감일만으로는 '마감은 멀지만 지금 급한 일' 을 나타낼 수 없어서 따로 둔다.
// 색은 마감 배지(DueBadge)와 겹치지 않게 고른다 — 마감은 따뜻한 쪽(빨강·주황),
// 우선순위는 차가운 쪽(보라·파랑)으로 갈라 두 축을 한눈에 구분한다.

export const TASK_PRIORITIES = ['none', 'low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  none: '없음',
  low: '낮음',
  normal: '보통',
  high: '높음',
  urgent: '긴급',
};

/** 급한 것이 먼저 오게 쓰는 순위값 */
export const PRIORITY_RANK: Record<TaskPriority, number> = {
  none: 0,
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

/** 배지 색. 'none' 은 배지를 그리지 않으므로 빈 값이다. */
export const PRIORITY_TONE: Record<TaskPriority, string> = {
  none: '',
  low: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  normal: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  high: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  urgent: 'bg-violet-200 text-violet-900 dark:bg-violet-900/50 dark:text-violet-200',
};

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && (TASK_PRIORITIES as readonly string[]).includes(value);
}
