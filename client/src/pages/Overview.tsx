// 대시보드 — 하루를 여는 한 장.
//
// 지금까지 사이드바 첫 항목 이름은 '대시보드' 인데 누르면 공유 일정으로 갔다. 이름과 가는 곳이
// 달랐고, 전체를 조망하는 화면은 어디에도 없었다. 여기가 그 자리다.
//
// 새 자료를 만들지 않는다. 세 가지를 이미 있는 길에서 모아 한 장에 놓는다 —
// 챙겨야 할 내 업무, 오늘의 일정, 내 게시판의 새 글. 각 칸은 제 화면으로 가는 문이다.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, FileText, LayoutDashboard, ListChecks } from 'lucide-react';
import { PageContainer } from '../components/common/PageContainer';
import { PageHeader } from '../components/common/PageHeader';
import { DueBadge } from '../components/tasks/DueBadge';
import { dueInfo } from '../components/tasks/taskViews';
import { fetchMyTasks, type MyTask, type WorkStatus } from '../api/tasks';
import { fetchRecentPosts } from '../api/posts';
import { getEvents } from '../api/events';
import type { CalendarEvent } from './components/calendar/types';
import { taskKeys } from '../api/queryKeys';
import { useFeature } from '../store/features';
import { useToday } from '../hooks/useToday';
import { formatRelativeDate } from '../utils/date';

const OPEN: WorkStatus[] = ['todo', 'doing'];
/** 한 칸에 놓는 줄 수. 넘치면 '외 N건' 으로 접고 전체는 제 화면에서 본다. */
const ROWS = 5;

function CardShell({
  title,
  icon,
  to,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  /** 전체를 보는 화면. 없으면 '전체 보기' 를 두지 않는다. */
  to?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <span className="text-slate-400">{icon}</span>
          {title}
        </h2>
        {to && (
          <Link
            to={to}
            className="flex-shrink-0 text-xs font-medium text-slate-400 hover:text-primary-600 hover:underline dark:hover:text-primary-400"
          >
            전체 보기
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

/** 챙겨야 할 내 업무. 마감이 지났거나 오늘인 것이 먼저다. */
function MyTaskCard() {
  const today = useToday();
  const { data = [], isError } = useQuery({
    // 업무 화면과 같은 열쇠를 써서 한 번 받아 온 것을 함께 쓴다
    queryKey: taskKeys.mine(OPEN.join(',')),
    queryFn: ({ signal }) => fetchMyTasks(OPEN, signal),
    staleTime: 60_000,
  });

  const dated = data.filter(t => dueInfo(t, today) !== null);
  const sorted: MyTask[] = [...dated].sort((a, b) =>
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
  );
  const late = sorted.filter(t => (dueInfo(t, today)?.days ?? 0) < 0).length;

  return (
    <CardShell title="내 업무" icon={<ListChecks className="h-4 w-4" />} to="/dashboard/tasks">
      {isError ? (
        <Empty>업무를 불러오지 못했습니다.</Empty>
      ) : sorted.length === 0 ? (
        <Empty>
          마감이 걸린 일이 없습니다.
          <br />
          담당자로 지정되면 여기에 모입니다.
        </Empty>
      ) : (
        <>
          {late > 0 && (
            <p className="mb-2 text-xs font-medium text-rose-600 dark:text-rose-400">
              마감이 지난 일 {late}건
            </p>
          )}
          <ul className="-mx-1 space-y-0.5">
            {sorted.slice(0, ROWS).map(task => (
              <li key={task.id}>
                <Link
                  to={`/dashboard/posts/${task.boardType}/${task.id}`}
                  className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-slate-100">
                    {task.title}
                  </span>
                  <DueBadge task={task} today={today} />
                </Link>
              </li>
            ))}
          </ul>
          {sorted.length > ROWS && (
            <p className="mt-2 text-xs text-slate-400">외 {sorted.length - ROWS}건</p>
          )}
        </>
      )}
    </CardShell>
  );
}

/** 오늘 걸치는 공유 일정. 게시판 일정은 그 게시판 달력에서 본다. */
function TodayEventCard() {
  const today = useToday();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  const key = start.toISOString().slice(0, 10);

  const { data = [], isError } = useQuery({
    queryKey: ['events', 'today', key],
    queryFn: () => getEvents(start, end) as Promise<CalendarEvent[]>,
    staleTime: 60_000,
  });

  const time = (event: CalendarEvent) =>
    event.isAllday
      ? '종일'
      : new Date(event.start).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

  return (
    <CardShell
      title="오늘 일정"
      icon={<CalendarDays className="h-4 w-4" />}
      to="/dashboard/calendar"
    >
      {isError ? (
        <Empty>일정을 불러오지 못했습니다.</Empty>
      ) : data.length === 0 ? (
        <Empty>오늘 예정된 일정이 없습니다.</Empty>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {data.slice(0, ROWS).map(event => (
            <li
              key={`${event.id}:${event.start}`}
              className="flex items-center gap-2 rounded-lg px-1 py-1.5"
            >
              <span className="flex-shrink-0 text-xs tabular-nums text-slate-400">
                {time(event)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-slate-100">
                {event.title}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.length > ROWS && (
        <p className="mt-2 text-xs text-slate-400">외 {data.length - ROWS}건</p>
      )}
    </CardShell>
  );
}

/** 들어갈 수 있는 게시판의 새 글. 안 읽은 것을 진하게 둔다. */
function RecentPostCard() {
  const { data = [], isError } = useQuery({
    queryKey: ['posts', 'recent'],
    queryFn: () => fetchRecentPosts(),
    staleTime: 60_000,
  });

  return (
    <CardShell title="새 글" icon={<FileText className="h-4 w-4" />}>
      {isError ? (
        <Empty>글을 불러오지 못했습니다.</Empty>
      ) : data.length === 0 ? (
        <Empty>아직 새 글이 없습니다.</Empty>
      ) : (
        <ul className="-mx-1 space-y-0.5">
          {data.slice(0, ROWS).map(post => (
            <li key={post.id}>
              <Link
                to={`/dashboard/posts/${post.boardType}/${post.id}`}
                className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    post.isRead
                      ? 'text-slate-500 dark:text-slate-400'
                      : 'font-medium text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {post.title}
                </span>
                <span className="hidden flex-shrink-0 text-xs text-slate-400 sm:inline">
                  {post.boardName}
                </span>
                <time
                  dateTime={post.createdAt}
                  className="flex-shrink-0 text-xs tabular-nums text-slate-400"
                >
                  {formatRelativeDate(post.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export default function Overview() {
  // 관리자가 끈 기능의 칸은 아예 두지 않는다 — 빈 상자만 남으면 꺼진 것인지 없는 것인지 모른다.
  const tasksOn = useFeature('post.tasks');
  const calendarOn = useFeature('tools.calendar');

  return (
    <PageContainer>
      <PageHeader
        title="대시보드"
        description="오늘 챙길 것만 모았습니다."
        icon={<LayoutDashboard className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {tasksOn && <MyTaskCard />}
        {calendarOn && <TodayEventCard />}
        <RecentPostCard />
      </div>
    </PageContainer>
  );
}
