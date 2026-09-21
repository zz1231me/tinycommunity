// 업무 상태 배지. 'none' 은 아무것도 그리지 않는다.

import type { WorkStatus } from '../../api/tasks';

const STYLES: Record<Exclude<WorkStatus, 'none'>, { label: string; className: string }> = {
  todo: {
    label: '할 일',
    className:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800',
  },
  doing: {
    label: '진행 중',
    className:
      'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 ring-1 ring-primary-200 dark:ring-primary-800',
  },
  done: {
    label: '완료',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  },
};

interface Props {
  status: WorkStatus;
  size?: 'sm' | 'md';
}

export function WorkStatusBadge({ status, size = 'sm' }: Props) {
  if (status === 'none') return null;
  const style = STYLES[status];

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-3 py-1 text-xs'
      } ${style.className}`}
    >
      {style.label}
    </span>
  );
}
