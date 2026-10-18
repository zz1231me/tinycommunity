// 업무 우선순위. 기본값은 정하지 않은 'none'.
//
// 마감일만으로는 '마감은 멀지만 지금 급한 일' 을 나타낼 수 없다. 지라의 Priority 자리다.
// 키는 코드가 고정하고 이름은 관리자가 바꾼다(사이트 설정 taskPriorityLabels).

export const TASK_PRIORITIES = {
  none: { label: '없음', description: '정하지 않음', rank: 0 },
  low: { label: '낮음', description: '시간이 날 때', rank: 1 },
  normal: { label: '보통', description: '평소 순서대로', rank: 2 },
  high: { label: '높음', description: '먼저 처리', rank: 3 },
  urgent: { label: '긴급', description: '지금 바로', rank: 4 },
} as const;

export type TaskPriority = keyof typeof TASK_PRIORITIES;

export const TASK_PRIORITY_KEYS = Object.keys(TASK_PRIORITIES) as TaskPriority[];

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TASK_PRIORITIES, value);
}
