// client/src/pages/MyTasks.tsx
// 내가 맡은 일.
//
// 게시판을 하나씩 열어 "내 이름이 붙은 글" 을 찾는 일이 없도록, 담당자가 나인 글을
// 게시판을 가로질러 모은다. 서버가 오래 안 건드린 것부터 준다 — 밀린 일이 위로 온다.
//
// 기본은 끝나지 않은 것만. 완료된 일까지 늘 함께 보이면 목록이 과거로 채워진다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { PageContainer } from '../components/common/PageContainer';
import { PageHeader } from '../components/common/PageHeader';
import { ListLoading, ListError, ListState } from '../components/common/ListState';
import { WorkStatusBadge } from '../components/boards/WorkStatusBadge';
import { fetchMyTasks, type WorkStatus } from '../api/tasks';
import { taskKeys } from '../api/queryKeys';
import { formatRelativeDate } from '../utils/date';

const OPEN: WorkStatus[] = ['todo', 'doing'];

export default function MyTasks() {
  const [showDone, setShowDone] = useState(false);
  const statuses = showDone ? [...OPEN, 'done' as WorkStatus] : OPEN;

  const { data, isLoading, isError } = useQuery({
    queryKey: taskKeys.mine(statuses.join(',')),
    queryFn: ({ signal }) => fetchMyTasks(statuses, signal),
    // 담당자·상태는 글 상세에서 바뀌는데 그쪽이 이 키를 무효화하지 않는다.
    // 전역 staleTime 이 5분이라 이것이 없으면 방금 맡은 일이 목록에 뜨지 않는다.
    refetchOnMount: 'always',
  });

  return (
    <PageContainer>
      <PageHeader
        title="내 업무"
        description="담당자가 나인 글입니다. 오래 손대지 않은 것부터 보여 줍니다."
        icon={<ClipboardList className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showDone}
            onChange={e => setShowDone(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-600"
          />
          완료한 일도 보기
        </label>
      </PageHeader>

      <section className="card overflow-hidden">
        {isLoading ? (
          <ListLoading />
        ) : isError ? (
          <ListError what="내 업무" />
        ) : (data?.length ?? 0) === 0 ? (
          <ListState size="roomy">
            맡은 일이 없습니다.
            <br />글 상세 화면에서 담당자로 지정되면 여기에 모입니다.
          </ListState>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {data?.map(task => (
              <li key={task.id}>
                <Link
                  to={`/dashboard/posts/${task.boardType}/${task.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40 sm:px-6"
                >
                  <WorkStatusBadge status={task.workStatus} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {task.title}
                  </span>
                  <span className="hidden flex-shrink-0 text-xs text-slate-400 sm:inline">
                    {task.boardName}
                  </span>
                  {/* 마지막으로 움직인 때 — "언제부터 멈춰 있나" 가 작성일보다 중요하다 */}
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
        )}
      </section>
    </PageContainer>
  );
}
