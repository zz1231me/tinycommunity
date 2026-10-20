// 하위 업무. 큰 업무를 '할 일 한 줄' 들로 쪼갠다(지라의 subtask 자리).
//
// 하위 업무도 글 하나라 담당자·마감·상태를 따로 가지고, 내 업무 목록과 달력에도 그대로 나온다.
// 한 단계만 둔다 — 서버도 하위의 하위를 막는다.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ListTree, Plus, X } from 'lucide-react';
import { addSubtask, detachSubtask, fetchSubtasks } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';
import { useStatusLabel } from '../tasks/useStatusLabel';
import { DueBadge } from '../tasks/DueBadge';
import { useToday } from '../../hooks/useToday';
import { useConfirm } from '../../hooks/useConfirm';
import { toast } from '../../utils/toast';
import { getApiErrorMessage } from '../../api/utils';

interface Props {
  boardType: string;
  postId: string;
  /** 상위 업무를 바꿀 수 있는 사람인지. 서버도 같은 규칙으로 막는다. */
  editable: boolean;
}

const STATUS_TONE: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  doing: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export function SubtaskPanel({ boardType, postId, editable }: Props) {
  const queryClient = useQueryClient();
  const statusLabel = useStatusLabel();
  const today = useToday();
  const { confirm, dialog } = useConfirm();
  const [title, setTitle] = useState('');

  const { data: subtasks = [] } = useQuery({
    queryKey: taskKeys.subtasks(boardType, postId),
    queryFn: ({ signal }) => fetchSubtasks(boardType, postId, signal),
    staleTime: 30_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: taskKeys.subtasks(boardType, postId) });
    // 하위도 '내 업무' 에 들어가는 글이다
    void queryClient.invalidateQueries({ queryKey: taskKeys.all });
  };

  const add = useMutation({
    mutationFn: (name: string) => addSubtask(boardType, postId, { title: name }),
    onSuccess: () => {
      setTitle('');
      refresh();
    },
    onError: err => toast.error(getApiErrorMessage(err, '하위 업무를 만들지 못했습니다.')),
  });

  const detach = useMutation({
    mutationFn: (childId: string) => detachSubtask(boardType, postId, childId),
    onSuccess: refresh,
    onError: err => toast.error(getApiErrorMessage(err, '떼어 내지 못했습니다.')),
  });

  // 붙은 것이 없고 붙일 권한도 없으면 빈 칸을 두지 않는다
  if (subtasks.length === 0 && !editable) return null;

  const done = subtasks.filter(t => t.workStatus === 'done').length;

  const askDetach = async (childId: string, name: string) => {
    const ok = await confirm({
      title: '하위 업무에서 떼어낼까요?',
      description: `'${name}' 은(는) 지워지지 않고 따로 선 업무로 남습니다.`,
      confirmLabel: '떼어내기',
    });
    if (ok) detach.mutate(childId);
  };

  return (
    <section className="card-body border-b border-slate-200 dark:border-slate-700">
      <header className="mb-2 flex items-center gap-2">
        <ListTree className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">하위 업무</h2>
        {subtasks.length > 0 && (
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {done}/{subtasks.length} 끝남
          </span>
        )}
      </header>

      {subtasks.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {subtasks.map(task => (
            <li key={task.id} className="flex items-center gap-2 py-2">
              {/* 제목이 먼저다 — 상태 칩을 앞에 두면 글자 수에 따라 제목 자리가 흔들린다 */}
              <Link
                to={`/dashboard/posts/${task.boardType}/${task.id}`}
                className={`min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:underline dark:text-slate-100 ${
                  task.workStatus === 'done'
                    ? 'text-slate-400 line-through dark:text-slate-500'
                    : ''
                }`}
              >
                {task.title}
              </Link>
              <span
                className={`flex-shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold ${
                  STATUS_TONE[task.workStatus] ?? STATUS_TONE.todo
                }`}
              >
                {statusLabel(task.workStatus)}
              </span>
              <DueBadge task={task} today={today} />
              {task.assignee && (
                <span className="hidden flex-shrink-0 text-xs text-slate-500 dark:text-slate-400 sm:inline">
                  {task.assignee.name}
                </span>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => void askDetach(task.id, task.title)}
                  aria-label={`${task.title} 떼어내기`}
                  className="flex-shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form
          onSubmit={e => {
            e.preventDefault();
            const name = title.trim();
            if (name) add.mutate(name);
          }}
          className="mt-2 flex items-center gap-2"
        >
          <Plus className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            placeholder="할 일을 한 줄로 적고 Enter"
            aria-label="하위 업무 제목"
            className="input flex-1 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={!title.trim() || add.isPending}
            className="btn-secondary px-2 py-1 text-xs"
          >
            추가
          </button>
        </form>
      )}
      {editable && (
        // 적으면 글이 하나 생긴다는 것을 말해 둔다. 모르고 적었다가 게시판에 글이
        // 늘어난 것을 보고 놀라는 일이 있었다 — 담당자·마감을 따로 두려고 글로 만든다.
        <p className="mt-1.5 text-2xs text-slate-400 dark:text-slate-500">
          적으면 이 게시판에 글이 하나 만들어집니다. 담당자·마감을 따로 정할 수 있고, 떼어 내도 글은
          남습니다.
        </p>
      )}
      {dialog}
    </section>
  );
}
