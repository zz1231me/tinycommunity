// 우선순위 배지. 정하지 않은 일('none')에는 아무것도 그리지 않는다 —
// 모든 카드에 '없음' 이 붙으면 정작 급한 것이 묻힌다.

import { PRIORITY_LABEL, PRIORITY_TONE, type TaskPriority } from './taskPriority';

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === 'none') return null;
  return (
    <span
      title={`우선순위 ${PRIORITY_LABEL[priority]}`}
      className={`inline-flex flex-shrink-0 items-center rounded px-1.5 py-0.5 text-2xs font-semibold ${PRIORITY_TONE[priority]}`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
