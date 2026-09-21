// 글 상세의 업무 상태·담당자 영역. 권한이 없는 사람에게는 읽기 전용으로 보여 준다.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDot, UserRound, X } from 'lucide-react';
import { Avatar } from '../Avatar';
import { UserPicker } from '../common/UserPicker';
import { WorkStatusBadge } from './WorkStatusBadge';
import { changeTask, fetchWorkStatuses, type TaskState, type WorkStatus } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';
import { getApiErrorMessage } from '../../api/utils';
import type { UserSuggestion } from '../../api/users';
import { toast } from '../../utils/toast';

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

  const { data: statuses = [] } = useQuery({
    queryKey: taskKeys.statuses,
    queryFn: ({ signal }) => fetchWorkStatuses(signal),
    // 상태 목록은 배포 전에는 바뀌지 않는다
    staleTime: Infinity,
  });

  const mutate = useMutation({
    mutationFn: (change: { assigneeId?: string | null; workStatus?: WorkStatus }) =>
      changeTask(boardType, postId, change),
    onSuccess: next => {
      onChange(next);
      setPickingAssignee(false);
      // 목록의 배지와 '내 업무' 도 함께 맞춘다
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      window.dispatchEvent(new Event('post-updated'));
    },
    onError: err => toast.error(getApiErrorMessage(err, '상태를 바꾸지 못했습니다.')),
  });

  // 상태가 없고 바꿀 수도 없으면 보여 줄 것이 없다
  if (!editable && state.workStatus === 'none' && !state.assignee) return null;

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
    </section>
  );
}
