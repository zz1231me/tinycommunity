// 업무 모아 보기. 기본은 담당자가 나인 글이고, 업무용 게시판 하나를 골라 팀 전체를 볼 수도 있다.
// 목록·칸반·간트 셋으로 보고, 고른 보기·범위는 주소(?view=·?board=)에 남는다.
// 보기와 '완료한 일도 보기' 는 다음에 들어와도 그대로이도록 이 브라우저에 기억한다.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Download } from 'lucide-react';
import { PageContainer } from '../components/common/PageContainer';
import { PageHeader } from '../components/common/PageHeader';
import { ListLoading, ListError, ListState } from '../components/common/ListState';
import { TaskKanban } from '../components/tasks/TaskKanban';
import { TaskGantt } from '../components/tasks/TaskGantt';
import { TaskList } from '../components/tasks/TaskList';
import { TaskFilters } from '../components/tasks/TaskFilters';
import { SavedFilters } from '../components/tasks/SavedFilters';
import { downloadTaskCsv, toTaskCsv } from '../components/tasks/taskCsv';
import type { SavedTaskFilter } from '../api/taskFilters';
import {
  SHARED_SCOPE,
  countDue,
  filterTasks,
  sortTasks,
  type TaskFilter,
  type TaskSort,
} from '../components/tasks/taskViews';
import { useStatusLabel } from '../components/tasks/useStatusLabel';
import {
  fetchAllTasks,
  fetchBoardTasks,
  fetchMyTasks,
  fetchTaskBoards,
  type WorkStatus,
} from '../api/tasks';
import { taskKeys } from '../api/queryKeys';
import { useUiPrefs } from '../hooks/useUiPrefs';
import { useTaskActions } from '../hooks/useTaskActions';
import { format } from 'date-fns';
import { useToday } from '../hooks/useToday';

const OPEN: WorkStatus[] = ['todo', 'doing'];

const VIEWS = [
  { key: 'list', label: '목록' },
  { key: 'kanban', label: '칸반' },
  { key: 'gantt', label: '간트' },
] as const;
type View = (typeof VIEWS)[number]['key'];

/** 서버가 한 번에 주는 최대 건수. server/src/services/postTask.service.ts 와 같은 값이다. */
const OPEN_LIMIT = 100;
const DONE_LIMIT = 50;

const EMPTY_FILTER: TaskFilter = { query: '', boardType: '', due: null, priority: null };

function isView(value: string | null): value is View {
  return VIEWS.some(v => v.key === value);
}

export default function MyTasks() {
  const [params, setParams] = useSearchParams();
  // 주소가 먼저다(공유한 링크는 그대로 열려야 한다). 없으면 지난번에 고른 보기.
  const urlView = params.get('view');
  // 보기·정렬·완료 표시는 계정에 저장한다(기기를 바꿔도 따라온다).
  const { prefs, setPref } = useUiPrefs();
  const view: View = isView(urlView)
    ? urlView
    : isView(prefs.taskView ?? null)
      ? (prefs.taskView as View)
      : 'list';
  const scope = params.get('board') ?? '';

  const showDone = prefs.taskShowDone === true;
  const sort: TaskSort = prefs.taskSort ?? 'stale';
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);

  const statuses = showDone ? [...OPEN, 'done' as WorkStatus] : OPEN;
  const shared = scope === SHARED_SCOPE;
  const queryKey = shared
    ? taskKeys.shared(statuses.join(','))
    : scope
      ? taskKeys.board(scope, statuses.join(','))
      : taskKeys.mine(statuses.join(','));

  const statusLabel = useStatusLabel();
  const today = useToday();
  // 카드를 옮기고 일정을 바꾸는 손은 게시판 안의 보기와 같은 것을 쓴다
  const { moveTask, saveSchedule, setSchedule, clearSchedule, dialog } = useTaskActions(queryKey);

  const setParam = (key: string, value: string | null) =>
    setParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );

  const setView = (next: View) => {
    setPref('taskView', next);
    setParam('view', next === 'list' ? null : next);
  };
  const setShowDone = (next: boolean) => setPref('taskShowDone', next);
  const setSort = (next: TaskSort) => setPref('taskSort', next);
  /**
   * 저장된 필터를 그대로 되살린다. 범위도 함께 바꾸지만 setScope 를 쓰지 않는다 —
   * 그쪽은 범위가 바뀔 때 조건을 비우는 자리라, 불러온 조건을 넣는 순서에 기대게 된다.
   */
  const applyPreset = (preset: SavedTaskFilter) => {
    setParam('board', preset.scope || null);
    setFilter({
      query: preset.query,
      boardType: preset.boardType,
      due: preset.due,
      priority: preset.priority,
    });
    setPref('taskSort', preset.sort);
  };

  /** 화면에 보이는 그대로(거르기·정렬 적용) 내려받는다 */
  const exportCsv = () => {
    downloadTaskCsv(
      toTaskCsv(visible, statusLabel),
      `${shared ? '전체-업무' : scope ? scopeName : '내-업무'}-${format(today, 'yyyy-MM-dd')}.csv`
    );
  };

  const setScope = (next: string) => {
    // 게시판 필터는 내 업무에서만 쓴다. 범위를 바꾸면 이전 조건이 남아 빈 화면이 되지 않게 비운다.
    setFilter(EMPTY_FILTER);
    setParam('board', next || null);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      shared
        ? fetchAllTasks(statuses, signal)
        : scope
          ? fetchBoardTasks(scope, statuses, signal)
          : fetchMyTasks(statuses, signal),
    // 글 상세가 이 키를 무효화하지 않으므로 마운트마다 다시 읽는다.
    refetchOnMount: 'always',
  });

  const { data: scopes = [] } = useQuery({
    queryKey: taskKeys.boards,
    queryFn: ({ signal }) => fetchTaskBoards(signal),
    staleTime: 5 * 60 * 1000,
  });

  const tasks = useMemo(() => data ?? [], [data]);
  const boards = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) seen.set(t.boardType, t.boardName);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [tasks]);
  const dueCounts = useMemo(() => countDue(tasks, today), [tasks, today]);
  const visible = useMemo(
    // 칸반은 열 안에서 급한 일이 위로 오게 마감 순으로 둔다. 간트는 서버 순서 그대로.
    () =>
      sortTasks(
        filterTasks(tasks, filter, today),
        view === 'list' ? sort : view === 'kanban' ? 'due' : 'stale'
      ),
    [tasks, filter, today, sort, view]
  );

  // 서버가 이 수에서 자른다(postTask.service 의 OPEN_LIMIT·DONE_LIMIT). 꽉 찼으면 더 있을 수 있다.
  const truncated =
    tasks.filter(t => t.workStatus !== 'done').length >= OPEN_LIMIT ||
    tasks.filter(t => t.workStatus === 'done').length >= DONE_LIMIT;

  const scopeName = scopes.find(b => b.id === scope)?.name ?? scope;
  const filtered = visible.length !== tasks.length;

  return (
    <PageContainer>
      <PageHeader
        title={shared ? '전체 업무' : scope ? `${scopeName} 업무` : '내 업무'}
        description={scope ? '바꿀 권한이 있는 업무만 옮길 수 있습니다.' : undefined}
        icon={<ClipboardList className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      >
        <div
          role="group"
          aria-label="보기"
          className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
        >
          {VIEWS.map(v => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === v.key
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={visible.length === 0}
          title="화면에 보이는 업무를 CSV 로 내려받습니다"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          내보내기
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showDone}
            onChange={e => setShowDone(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-primary-600"
          />
          완료한 일도 보기
        </label>
      </PageHeader>

      <TaskFilters
        scope={scope}
        scopes={scopes}
        onScopeChange={setScope}
        filter={filter}
        onFilterChange={setFilter}
        boards={boards}
        dueCounts={dueCounts}
        savedFilters={
          <SavedFilters current={{ ...filter, name: '', scope, sort }} onApply={applyPreset} />
        }
        sort={view === 'list' ? sort : undefined}
        onSortChange={setSort}
      />

      {isLoading ? (
        <section className="card overflow-hidden">
          <ListLoading />
        </section>
      ) : isError ? (
        <section className="card overflow-hidden">
          <ListError what={shared ? '전체 업무' : scope ? '게시판 업무' : '내 업무'} />
        </section>
      ) : tasks.length === 0 ? (
        <section className="card overflow-hidden">
          <ListState size="roomy">
            {shared ? (
              '함께 보는 게시판에 아직 업무가 없습니다.'
            ) : scope ? (
              '이 게시판에는 아직 업무가 없습니다.'
            ) : (
              <>
                맡은 일이 없습니다.
                <br />글 상세 화면에서 담당자로 지정되면 여기에 모입니다.
              </>
            )}
          </ListState>
        </section>
      ) : visible.length === 0 ? (
        <section className="card overflow-hidden">
          <ListState size="roomy">
            조건에 맞는 업무가 없습니다.
            <br />
            <button
              type="button"
              onClick={() => setFilter(EMPTY_FILTER)}
              className="mt-2 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              조건 지우기
            </button>
          </ListState>
        </section>
      ) : view === 'kanban' ? (
        <TaskKanban
          tasks={visible}
          showDone={showDone}
          showAssignee={Boolean(scope)}
          showBoard={!scope || shared}
          onMove={moveTask}
          onSchedule={setSchedule}
          onClearSchedule={clearSchedule}
        />
      ) : view === 'gantt' ? (
        <TaskGantt tasks={visible} onReschedule={saveSchedule} />
      ) : (
        <section className="card overflow-hidden">
          <TaskList tasks={visible} today={today} showAssignee={Boolean(scope)} />
        </section>
      )}
      {truncated && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          업무가 많아 끝나지 않은 일은 오래 방치된 {OPEN_LIMIT}건, 완료한 일은 최근 {DONE_LIMIT}건만
          불러왔습니다. 검색이나 게시판으로 좁혀 보세요.
        </p>
      )}
      {filtered && visible.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          전체 {tasks.length}건 중 {visible.length}건을 보여 줍니다.
        </p>
      )}
      {dialog}
    </PageContainer>
  );
}
