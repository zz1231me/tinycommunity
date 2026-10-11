// 칸반 카드·간트 막대 위에 띄우는 업무 상세.

import type { MyTask } from '../../api/tasks';
import { formatRelativeDate } from '../../utils/date';
import { dueInfo, formatSchedule } from './taskViews';
import { useStatusLabel } from './useStatusLabel';

interface Props {
  task: MyTask;
  /** 간트에서 끄는 중이면 아직 저장 전인 일정을 보여 준다 */
  schedule?: { startDate: string | null; dueDate: string | null };
}

export function TaskTooltipContent({ task, schedule }: Props) {
  const statusLabel = useStatusLabel();
  const { startDate, dueDate } = schedule ?? task;
  const due = dueInfo({ dueDate, workStatus: task.workStatus }, new Date());
  return (
    <div className="space-y-1">
      <p className="font-semibold">{task.title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-300">
        <dt>게시판</dt>
        <dd>{task.boardName}</dd>
        <dt>상태</dt>
        <dd>{statusLabel(task.workStatus)}</dd>
        <dt>담당</dt>
        <dd>{task.assignee?.name ?? '없음'}</dd>
        <dt>일정</dt>
        <dd>
          {formatSchedule(startDate, dueDate)}
          {due && ` (${due.label})`}
        </dd>
        <dt>마지막 변경</dt>
        <dd>{formatRelativeDate(task.updatedAt)}</dd>
      </dl>
      {!task.canEdit && <p className="text-slate-400">이 업무는 바꿀 권한이 없습니다.</p>}
    </div>
  );
}
