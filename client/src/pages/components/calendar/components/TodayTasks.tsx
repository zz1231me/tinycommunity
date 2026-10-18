// 첫 화면의 '오늘 해야 하는 일'.
//
// 지금까지 첫 화면은 일정만 보여 줬다. 마감이 오늘이거나 이미 지난 내 업무는 '내 업무'
// 화면에 들어가야 보여서, 하루를 여는 화면이 '오늘 무엇이 필요한가' 에 답하지 못했다.
//
// 비어 있으면 아예 그리지 않는다 — 첫 화면은 할 일이 있을 때만 말을 건다.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchMyTasks, type MyTask, type WorkStatus } from '../../../../api/tasks';
import { taskKeys } from '../../../../api/queryKeys';
import { dueInfo } from '../../../../components/tasks/taskViews';
import { DueBadge } from '../../../../components/tasks/DueBadge';
import { useToday } from '../../../../hooks/useToday';
import { useFeature } from '../../../../store/features';

/** '내 업무' 화면과 같은 열쇠를 써서 한 번 받아 온 것을 함께 쓴다. */
const OPEN: WorkStatus[] = ['todo', 'doing'];
const MAX_ROWS = 6;

export function TodayTasks() {
  const enabled = useFeature('post.tasks');
  const today = useToday();

  const { data = [] } = useQuery({
    queryKey: taskKeys.mine(OPEN.join(',')),
    queryFn: ({ signal }) => fetchMyTasks(OPEN, signal),
    enabled,
    staleTime: 60_000,
  });

  // 마감이 지났거나 오늘인 것만. 지난 것이 먼저다.
  const urgent: MyTask[] = data
    .filter(task => {
      const info = dueInfo(task, today);
      return info !== null && info.days <= 0;
    })
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

  if (!enabled || urgent.length === 0) return null;

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">오늘 할 일</h3>
        <Link
          to="/dashboard/tasks"
          className="text-xs font-medium text-slate-400 hover:text-primary-600 hover:underline dark:hover:text-primary-400"
        >
          전체 보기
        </Link>
      </div>
      <ul className="-mx-1 space-y-0.5">
        {urgent.slice(0, MAX_ROWS).map(task => (
          <li key={task.id}>
            <Link
              to={`/dashboard/posts/${task.boardType}/${task.id}`}
              className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {task.title}
              </span>
              <DueBadge task={task} today={today} />
            </Link>
          </li>
        ))}
      </ul>
      {urgent.length > MAX_ROWS && (
        <p className="mt-2 text-xs text-slate-400">외 {urgent.length - MAX_ROWS}건</p>
      )}
    </section>
  );
}
