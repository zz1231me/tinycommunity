// 업무 목록 보기. 한 줄에 상태·제목·마감·게시판(또는 담당자)·마지막 변경을 보여 준다.

import { Link } from 'react-router-dom';
import type { MyTask } from '../../api/tasks';
import { formatRelativeDate } from '../../utils/date';
import { WorkStatusBadge } from '../boards/WorkStatusBadge';
import { DueBadge } from './DueBadge';
import { PriorityBadge } from './PriorityBadge';
import { formatSchedule } from './taskViews';
import { useStatusLabel } from './useStatusLabel';

interface Props {
  tasks: MyTask[];
  today: Date;
  /** 팀 보기에서는 게시판 대신 담당자를 보여 준다 */
  showAssignee: boolean;
}

export function TaskList({ tasks, today, showAssignee }: Props) {
  const statusLabel = useStatusLabel();
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
      {tasks.map(task => (
        <li key={task.id}>
          <Link
            to={`/dashboard/posts/${task.boardType}/${task.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 sm:px-6"
          >
            <WorkStatusBadge status={task.workStatus} label={statusLabel(task.workStatus)} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {task.title}
            </span>
            <PriorityBadge priority={task.priority} />
            <DueBadge task={task} today={today} />
            {(task.startDate || task.dueDate) && (
              <span className="hidden flex-shrink-0 text-xs tabular-nums text-slate-400 md:inline">
                {formatSchedule(task.startDate, task.dueDate)}
              </span>
            )}
            <span className="hidden flex-shrink-0 text-xs text-slate-400 sm:inline">
              {showAssignee ? (task.assignee?.name ?? '담당 없음') : task.boardName}
            </span>
            {/* 마지막으로 움직인 때 */}
            <time
              dateTime={task.updatedAt}
              title="마지막 변경"
              className="flex-shrink-0 text-xs tabular-nums text-slate-400"
            >
              {formatRelativeDate(task.updatedAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
