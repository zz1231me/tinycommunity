// 글 상세의 업무 상태·담당자·일정 영역. 권한이 없는 사람에게는 읽기 전용으로 보여 준다.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, CircleDot, UserRound, X, Flag } from 'lucide-react';
import { Avatar } from '../Avatar';
import { UserPicker } from '../common/UserPicker';
import { PriorityBadge } from '../tasks/PriorityBadge';
import { PRIORITY_LABEL, TASK_PRIORITIES, type TaskPriority } from '../tasks/taskPriority';
import { WorkStatusBadge } from './WorkStatusBadge';
import { changeTask, fetchWorkStatuses, type TaskState, type WorkStatus } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/utils';
import type { UserSuggestion } from '../../api/users';
import { toast } from '../../utils/toast';
import { useConfirm } from '../../hooks/useConfirm';
import { DueBadge } from '../tasks/DueBadge';
import { formatSchedule } from '../tasks/taskViews';
import { DateRangePicker } from '../tasks/DateRangePicker';

interface Props {
  boardType: string;
  postId: string;
  state: TaskState;
  /** 상태·담당자를 바꿀 수 있는 사람인지. */
  editable: boolean;
  onChange: (next: TaskState) => void;
}

export function TaskPanel({ boardType, postId, state, editable, onChange }: Props) {
  const queryClient = useQueryClient();
  const [pickingAssignee, setPickingAssignee] = useState(false);
  const { confirm, dialog } = useConfirm();

  const { data: statuses = [] } = useQuery({
    queryKey: taskKeys.statuses,
    queryFn: ({ signal }) => fetchWorkStatuses(signal),
    // 상태 목록은 배포 전에는 바뀌지 않는다
    staleTime: Infinity,
  });

  // 이 판이 사라진 뒤 도착한 응답을 부모에 전하지 않는다. 글 사이를 오가면 이 판은
  // 사라지지만 부모(글 상세)는 살아 있어, 늦은 응답이 다른 글의 담당자·상태를 써 넣었다.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const mutate = useMutation({
    mutationFn: (change: {
      assigneeId?: string | null;
      workStatus?: WorkStatus;
      priority?: TaskPriority;
      startDate?: string | null;
      dueDate?: string | null;
      showOnCalendar?: boolean;
    }) => changeTask(boardType, postId, change),
    onSuccess: next => {
      if (!aliveRef.current) return;
      onChange(next);
      setPickingAssignee(false);
      // 목록의 배지와 '내 업무' 도 함께 맞춘다
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      window.dispatchEvent(new Event('post-updated'));
    },
    onError: err => {
      if (!aliveRef.current) return;
      toast.error(getApiErrorMessage(err, '상태를 바꾸지 못했습니다.'));
    },
  });

  const hasSchedule = Boolean(state.startDate || state.dueDate);
  const clearSchedule = async () => {
    // 지운 날짜는 되살릴 길이 없어 묻는다
    const ok = await confirm({
      title: '일정을 지울까요?',
      description: '시작일·마감일을 지웁니다. 마감 알림도 더 오지 않습니다.',
      confirmLabel: '일정 지우기',
      danger: true,
    });
    if (ok) mutate.mutate({ startDate: null, dueDate: null });
  };

  // 상태가 없고 바꿀 수도 없으면 보여 줄 것이 없다
  if (!editable && state.workStatus === 'none' && !state.assignee && !hasSchedule) return null;

  return (
    <section
      aria-label="업무 상태"
      className="card-header flex-wrap gap-x-6 gap-y-3 bg-slate-50/70 dark:bg-slate-800/40"
    >
      {/* 상태 */}
      <div className="flex items-center gap-2">
        <CircleDot className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">상태</span>

        {editable ? (
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="업무 상태 선택">
            {statuses.map(option => {
              const active = state.workStatus === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={option.description}
                  disabled={mutate.isPending}
                  onClick={() => mutate.mutate({ workStatus: option.key })}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? 'bg-primary-600 text-white'
                      : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : state.workStatus === 'none' ? (
          <span className="text-xs text-slate-400">없음</span>
        ) : (
          <WorkStatusBadge status={state.workStatus} />
        )}
      </div>

      {/* 우선순위 — 마감과 다른 축이다. 마감이 멀어도 급한 일을 나타낸다. */}
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">우선순위</span>

        {/* 고르는 칸 하나로 둔다. 다섯 개를 늘어놓으면 이 줄의 단추가 열한 개가 되고,
            상태의 '없음' 과 우선순위의 '없음' 이 똑같이 강조돼 둘이 헷갈린다.
            자주 누르는 것은 상태라 그쪽만 펼쳐 둔다. */}
        {editable ? (
          <select
            aria-label="우선순위"
            value={state.priority}
            disabled={mutate.isPending}
            onChange={e => mutate.mutate({ priority: e.target.value as TaskPriority })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {TASK_PRIORITIES.map(key => (
              <option key={key} value={key}>
                {PRIORITY_LABEL[key]}
              </option>
            ))}
          </select>
        ) : state.priority === 'none' ? (
          <span className="text-xs text-slate-400">없음</span>
        ) : (
          <PriorityBadge priority={state.priority} />
        )}
      </div>

      {/* 담당자 */}
      <div className="flex min-w-0 items-center gap-2">
        <UserRound className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">담당</span>

        {state.assignee ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar user={state.assignee} size="xs" />
            <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
              {state.assignee.name}
            </span>
            {editable && (
              <button
                type="button"
                onClick={() => mutate.mutate({ assigneeId: null })}
                disabled={mutate.isPending}
                aria-label="담당자 해제"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ) : editable ? (
          <button
            type="button"
            onClick={() => setPickingAssignee(v => !v)}
            aria-expanded={pickingAssignee}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            지정
          </button>
        ) : (
          <span className="text-xs text-slate-400">없음</span>
        )}
      </div>

      {/* 일정 */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">일정</span>
        {editable ? (
          <DateRangePicker
            value={state}
            disabled={mutate.isPending}
            onApply={schedule => mutate.mutate(schedule)}
            onClear={clearSchedule}
          />
        ) : (
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {formatSchedule(state.startDate, state.dueDate)}
          </span>
        )}
        <DueBadge
          task={{ dueDate: state.dueDate, workStatus: state.workStatus }}
          today={new Date()}
        />
        {/*
          일정은 그대로 두고 달력에서만 뺀다. 기간은 필요한데 달력이 그것으로 가득 차는
          업무가 있다 — 끄면 간트·목록에는 남고 달력에서만 사라진다.
          일정이 없으면 애초에 달력에 그려질 것이 없으므로 두지 않는다.
        */}
        {hasSchedule &&
          (editable ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={state.showOnCalendar}
                disabled={mutate.isPending}
                onChange={e => mutate.mutate({ showOnCalendar: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 dark:border-slate-600"
              />
              달력에 표시
            </label>
          ) : (
            !state.showOnCalendar && (
              <span className="text-xs text-slate-400">달력에 표시하지 않음</span>
            )
          ))}
      </div>

      {pickingAssignee && editable && (
        <div className="w-full max-w-sm">
          <UserPicker
            selected={[]}
            single
            autoFocus
            boardType={boardType}
            placeholder="담당자 검색"
            onChange={(picked: UserSuggestion[]) => {
              const user = picked[0];
              if (user) mutate.mutate({ assigneeId: user.id });
            }}
          />
          <p className="mt-1 text-xs text-slate-400">이 게시판을 볼 수 있는 사람만 나옵니다.</p>
        </div>
      )}
      {dialog}
    </section>
  );
}
