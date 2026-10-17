// 한곳에서 보는 활동 피드. 컨플루언스의 activity stream 자리다.
//
// 새 글·새 댓글·업무 변경이 게시판마다 흩어져 있어, 무슨 일이 있었는지 보려면 게시판을
// 하나씩 들러야 했다. 읽을 수 있는 것만 서버가 걸러 시간순으로 준다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText, MessageSquare, CircleDot } from 'lucide-react';
import { fetchActivity, type ActivityItem } from '../../api/activity';
import { discoveryKeys } from '../../api/queryKeys';
import { formatRelative } from '../../utils/date';
import { useStatusLabel } from '../tasks/useStatusLabel';
import { PRIORITY_LABEL, isTaskPriority } from '../tasks/taskPriority';
import type { WorkStatus } from '../../api/tasks';

const PAGE = 20;

const WORK_STATUSES: WorkStatus[] = ['none', 'todo', 'doing', 'done'];
const isWorkStatus = (value: string): value is WorkStatus =>
  (WORK_STATUSES as string[]).includes(value);

const ICON: Record<ActivityItem['kind'], typeof FileText> = {
  post: FileText,
  comment: MessageSquare,
  task: CircleDot,
};

const TONE: Record<ActivityItem['kind'], string> = {
  post: 'text-primary-600 dark:text-primary-400',
  comment: 'text-sky-600 dark:text-sky-400',
  task: 'text-violet-600 dark:text-violet-400',
};

export function ActivityFeed() {
  // 이어 보기는 '이 시각보다 이전' 으로 집는다. 읽을 수 없는 줄이 걸러지므로 몇 번째인지로는 샌다.
  const [before, setBefore] = useState<string | null>(null);
  const [older, setOlder] = useState<ActivityItem[]>([]);
  const statusLabel = useStatusLabel();

  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: discoveryKeys.activity,
    queryFn: ({ signal }) => fetchActivity({ limit: PAGE }, signal),
    staleTime: 60_000,
  });

  const more = useQuery({
    queryKey: [...discoveryKeys.activity, before],
    queryFn: ({ signal }) => fetchActivity({ limit: PAGE, before: before as string }, signal),
    enabled: before !== null,
    staleTime: 60_000,
  });

  // 더 받아 온 줄을 아래에 잇는다. 같은 줄이 두 번 들어오지 않게 id 로 가린다.
  const items = [...data, ...older, ...(more.data ?? [])].filter(
    (item, index, all) => all.findIndex(other => other.id === item.id) === index
  );

  const loadMore = () => {
    const last = items[items.length - 1];
    if (!last) return;
    setOlder(items);
    setBefore(last.at);
  };

  if (isLoading) {
    return <p className="px-3 py-8 text-center text-sm text-slate-500">불러오는 중…</p>;
  }
  if (isError) {
    return (
      <p className="px-3 py-8 text-center text-sm text-slate-500">활동을 불러오지 못했습니다.</p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        아직 쌓인 활동이 없습니다.
      </p>
    );
  }

  /** 업무 변경 한 줄을 사람 말로. 값을 못 알아보면 종류만 말한다. */
  const taskLine = (item: ActivityItem): string => {
    const to = item.toValue ?? null;
    if (item.change === 'status') {
      return to && isWorkStatus(to) ? `${statusLabel(to)}(으)로 옮김` : '업무 상태를 바꿈';
    }
    if (item.change === 'priority') {
      return to && isTaskPriority(to)
        ? `우선순위를 ${PRIORITY_LABEL[to]}(으)로`
        : '우선순위를 바꿈';
    }
    if (item.change === 'assignee') return to ? '담당자를 지정' : '담당자를 비움';
    return '일정을 바꿈';
  };

  const line = (item: ActivityItem): string => {
    if (item.kind === 'post') return '새 글';
    if (item.kind === 'comment') return '댓글';
    return taskLine(item);
  };

  return (
    <div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map(item => {
          const Icon = ICON[item.kind];
          return (
            <li key={item.id}>
              <Link
                to={`/dashboard/posts/${item.boardType}/${item.postId}`}
                className="flex items-start gap-3 px-1 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 flex-shrink-0 ${TONE[item.kind]}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.postTitle}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {item.boardName} · {line(item)}
                    {item.actor ? ` · ${item.actor.name}` : ''}
                  </span>
                </span>
                <span className="flex-shrink-0 whitespace-nowrap text-xs text-slate-400">
                  {formatRelative(item.at)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* 한 쪽을 꽉 채워 왔으면 더 있을 수 있다 */}
      {items.length >= PAGE && (
        <div className="pt-3 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={more.isFetching}
            className="text-sm font-medium text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
          >
            {more.isFetching ? '불러오는 중…' : '더 보기'}
          </button>
        </div>
      )}
    </div>
  );
}
