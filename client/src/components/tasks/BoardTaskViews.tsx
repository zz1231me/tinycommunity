// 게시판 안에서 그 게시판의 업무를 보드·간트로 본다.
//
// 지금까지 이 두 보기는 '내 업무' 화면에만 있었다. 한 게시판의 간트를 보려면
// 내 업무 → 범위 고르기 → 게시판 선택 → 간트, 네 번을 거치고 게시판을 떠나야 했다.
// 부품(TaskKanban·TaskGantt)과 서버 길(fetchBoardTasks)은 그대로 쓰고 자리만 옮긴다.

import { useQuery } from '@tanstack/react-query';
import { ListLoading, ListError, ListState } from '../common/ListState';
import { TaskKanban } from './TaskKanban';
import { TaskGantt } from './TaskGantt';
import { sortTasks } from './taskViews';
import { fetchBoardTasks, type WorkStatus } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';
import { useUiPrefs } from '../../hooks/useUiPrefs';
import { useTaskActions } from '../../hooks/useTaskActions';

const OPEN: WorkStatus[] = ['todo', 'doing'];

export function BoardTaskViews({
  boardType,
  view,
}: {
  boardType: string;
  view: 'kanban' | 'gantt';
}) {
  // '완료한 일도 보기' 는 내 업무와 같은 설정을 쓴다 — 화면마다 다르게 기억하면
  // 같은 사람이 같은 질문에 두 번 답해야 한다.
  const { prefs, setPref } = useUiPrefs();
  const showDone = prefs.taskShowDone === true;
  const statuses = showDone ? [...OPEN, 'done' as WorkStatus] : OPEN;

  const queryKey = taskKeys.board(boardType, statuses.join(','));
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchBoardTasks(boardType, statuses, signal),
    // 글 상세에서 상태를 바꾸고 돌아와도 옛 목록이 남지 않게
    refetchOnMount: 'always',
  });
  const { moveTask, saveSchedule, setSchedule, clearSchedule, dialog } = useTaskActions(queryKey);

  const tasks = data ?? [];
  // 칸반은 열 안에서 급한 일이 위로 오게 마감 순으로. 간트는 서버 순서 그대로.
  const shown = sortTasks(tasks, view === 'kanban' ? 'due' : 'stale');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          이 게시판의 업무입니다. 바꿀 권한이 있는 것만 옮길 수 있습니다.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showDone}
            onChange={e => setPref('taskShowDone', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 dark:border-slate-600"
          />
          완료한 일도 보기
        </label>
      </div>

      {isLoading ? (
        <section className="card overflow-hidden">
          <ListLoading />
        </section>
      ) : isError ? (
        <section className="card overflow-hidden">
          <ListError what="게시판 업무" />
        </section>
      ) : tasks.length === 0 ? (
        <section className="card overflow-hidden">
          <ListState size="roomy">
            아직 업무로 추적하는 글이 없습니다.
            <br />글 상세 화면에서 상태를 정하면 여기에 모입니다.
          </ListState>
        </section>
      ) : view === 'kanban' ? (
        <TaskKanban
          tasks={shown}
          showDone={showDone}
          showAssignee
          // 이 게시판 안이라 카드마다 같은 게시판 이름이 반복될 뿐이다
          showBoard={false}
          onMove={moveTask}
          onSchedule={setSchedule}
          onClearSchedule={clearSchedule}
        />
      ) : (
        <TaskGantt tasks={shown} onReschedule={saveSchedule} />
      )}
      {dialog}
    </div>
  );
}
