// client/src/pages/MyTasks.test.tsx
//
// 담당자·업무 상태는 글 상세에서 바뀌는데, 그쪽은 이 목록의 캐시 키를 무효화하지 않는다.
// 전역 staleTime 이 5분이라 그대로 두면 방금 맡은 일이 목록에 뜨지 않고,
// 담당에서 빠진 일이 계속 남는다. 화면을 다시 열 때마다 서버에 다시 묻는지 고정한다.
//
// 그 밖에: 보기·범위 전환과 기억, 칸반에서 옮긴 뒤의 저장·되돌리기, 일정 지우기 확인, 거르기.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MyTasks from './MyTasks';
import type { MyTask } from '../api/tasks';
import type { KanbanStatus } from '../components/tasks/taskViews';

const api = vi.hoisted(() => ({
  fetchMyTasks: vi.fn(),
  fetchBoardTasks: vi.fn(),
  fetchTaskBoards: vi.fn(),
  fetchWorkStatuses: vi.fn(),
  changeTask: vi.fn(),
}));
vi.mock('../api/tasks', async () => {
  const actual = await vi.importActual<typeof import('../api/tasks')>('../api/tasks');
  return { ...actual, ...api };
});
const { fetchMyTasks, fetchBoardTasks, fetchTaskBoards, changeTask } = api;

// 끌어 놓기는 happy-dom 에서 잴 수 없어, 놓은 결과(onMove 등)만 단추로 흉내 낸다.
vi.mock('../components/tasks/TaskKanban', () => ({
  TaskKanban: ({
    tasks,
    onMove,
    onClearSchedule,
  }: {
    tasks: MyTask[];
    onMove: (task: MyTask, to: KanbanStatus) => void;
    onClearSchedule: (task: MyTask) => void;
  }) => (
    <div data-testid="kanban">
      {tasks.map(t => (
        <p key={t.id}>
          {t.title}:{t.workStatus}
        </p>
      ))}
      <button type="button" onClick={() => onMove(tasks[0], 'doing')}>
        진행 중으로 놓기
      </button>
      <button type="button" onClick={() => onMove(tasks[0], 'done')}>
        완료로 놓기
      </button>
      <button type="button" onClick={() => onClearSchedule(tasks[0])}>
        일정 지우기 누름
      </button>
    </div>
  ),
}));

// PageContainer 의 등장 애니메이션은 happy-dom 에서 언마운트 시 AbortError 를 남긴다.
vi.mock('framer-motion', () => ({ motion: new Proxy({}, { get: () => 'div' }) }));

const task = (title: string, over: Partial<MyTask> = {}): MyTask => ({
  id: 'P1',
  title,
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'todo',
  priority: 'none',
  assignee: null,
  canEdit: true,
  startDate: null,
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

/** 오늘 기준 며칠 뒤의 'YYYY-MM-DD' */
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 운영과 같은 기본값 — 전역 staleTime 5분(QueryProvider) */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 },
      mutations: { retry: false },
    },
  });
}

const view = (queryClient: QueryClient, url = '/') =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <MyTasks />
      </MemoryRouter>
    </QueryClientProvider>
  );

// 전역 setup 의 localStorage 는 아무것도 기억하지 않는 가짜다. 보기 기억을 재려면 실제로 담아야 한다.
const stored = new Map<string, string>();

beforeEach(() => {
  vi.clearAllMocks();
  stored.clear();
  vi.mocked(localStorage.getItem).mockImplementation(key => stored.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
    stored.set(key, String(value));
  });
  // 토스트는 React 밖 DOM 에 남는다. 앞 검사의 알림이 다음 검사에서 보이지 않게 지운다.
  document.getElementById('app-toast-container')?.remove();
  document.getElementById('app-toast-action-container')?.remove();
  fetchTaskBoards.mockResolvedValue([{ id: 'qc', name: 'QC' }]);
  api.fetchWorkStatuses.mockResolvedValue([]);
});

describe('MyTasks', () => {
  it('다시 열면 캐시가 신선해도 서버에 다시 묻는다', async () => {
    fetchMyTasks.mockResolvedValueOnce([]).mockResolvedValueOnce([task('방금 맡은 일')]);

    const queryClient = makeClient();
    const first = view(queryClient);
    expect(await screen.findByText(/맡은 일이 없습니다/)).toBeInTheDocument();
    first.unmount();

    // 다른 화면에서 담당자가 지정된 상황. 캐시를 그대로 쓰면 여기서 요청이 나가지 않는다.
    view(queryClient);
    expect(await screen.findByText('방금 맡은 일')).toBeInTheDocument();
    expect(fetchMyTasks).toHaveBeenCalledTimes(2);
  });
});

describe('보기 전환과 기억', () => {
  it('보기 단추로 칸반으로 바꾸고, 주소의 ?view= 로 바로 열 수도 있다', async () => {
    fetchMyTasks.mockResolvedValue([task('정리')]);
    view(makeClient());
    expect(await screen.findByText('정리')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '칸반' }));
    expect(await screen.findByTestId('kanban')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '칸반' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('고른 보기와 완료 보기 여부는 다음에 메뉴로 들어와도 그대로다', async () => {
    fetchMyTasks.mockResolvedValue([task('정리')]);
    const first = view(makeClient());
    await screen.findByText('정리');
    fireEvent.click(screen.getByRole('button', { name: '칸반' }));
    fireEvent.click(screen.getByLabelText('완료한 일도 보기'));
    first.unmount();

    // 주소에 ?view= 가 없는 채로 다시 연다
    view(makeClient());
    expect(await screen.findByTestId('kanban')).toBeInTheDocument();
    expect(screen.getByLabelText('완료한 일도 보기')).toBeChecked();
    expect(fetchMyTasks).toHaveBeenLastCalledWith(['todo', 'doing', 'done'], expect.anything());
  });

  it('주소의 보기가 기억한 보기보다 먼저다 — 공유한 링크는 그대로 열려야 한다', async () => {
    stored.set('myhome-ui-prefs', JSON.stringify({ taskView: 'kanban' }));
    fetchMyTasks.mockResolvedValue([task('정리')]);
    view(makeClient(), '/?view=list');
    expect(await screen.findByText('정리')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban')).not.toBeInTheDocument();
  });
});

describe('팀 보기', () => {
  it('?board= 로 열면 그 게시판의 업무 전체를 담당자와 함께 보여 준다', async () => {
    fetchBoardTasks.mockResolvedValue([
      task('남의 일', { assignee: { id: 'u2', name: '김동료', avatar: null }, canEdit: false }),
    ]);
    view(makeClient(), '/?board=qc');
    expect(await screen.findByText('남의 일')).toBeInTheDocument();
    expect(screen.getByText('김동료')).toBeInTheDocument();
    expect(fetchBoardTasks).toHaveBeenCalledWith('qc', ['todo', 'doing'], expect.anything());
    expect(fetchMyTasks).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'QC 업무' })).toBeInTheDocument();
  });

  it('범위 고르기로 내 업무와 게시판 사이를 오간다', async () => {
    fetchMyTasks.mockResolvedValue([task('내 일')]);
    fetchBoardTasks.mockResolvedValue([task('팀 일', { id: 'P2' })]);
    view(makeClient());
    await screen.findByText('내 일');
    // 범위 목록은 따로 읽어 온다
    await screen.findByRole('option', { name: 'QC 전체' });

    fireEvent.change(screen.getByLabelText('보는 범위'), { target: { value: 'qc' } });
    expect(await screen.findByText('팀 일')).toBeInTheDocument();
  });
});

describe('거르기', () => {
  const tasks = [
    task('지난 일', { id: 'a', dueDate: day(-2) }),
    task('오늘 일', { id: 'b', dueDate: day(0) }),
    task('나중 일', { id: 'c', dueDate: day(30) }),
    task('일정 없는 일', { id: 'd' }),
  ];

  it('마감 요약에 수를 보여 주고, 누르면 그것만 남긴다', async () => {
    fetchMyTasks.mockResolvedValue(tasks);
    view(makeClient());
    await screen.findByText('지난 일');

    const overdue = screen.getByRole('button', { name: /마감 지남/ });
    expect(overdue).toHaveTextContent('1');
    fireEvent.click(overdue);
    expect(screen.getByText('지난 일')).toBeInTheDocument();
    expect(screen.queryByText('나중 일')).not.toBeInTheDocument();
    expect(screen.getByText('전체 4건 중 1건을 보여 줍니다.')).toBeInTheDocument();

    // 다시 누르면 푼다
    fireEvent.click(overdue);
    expect(screen.getByText('나중 일')).toBeInTheDocument();
  });

  it('검색 결과가 없으면 빈 목록 대신 조건을 지울 길을 준다', async () => {
    fetchMyTasks.mockResolvedValue(tasks);
    view(makeClient());
    await screen.findByText('지난 일');

    fireEvent.change(screen.getByPlaceholderText('제목으로 찾기'), {
      target: { value: '없는제목' },
    });
    expect(screen.getByText(/조건에 맞는 업무가 없습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '조건 지우기' }));
    expect(screen.getByText('나중 일')).toBeInTheDocument();
  });

  it('목록은 마감 빠른 순으로 정렬할 수 있다', async () => {
    fetchMyTasks.mockResolvedValue([tasks[2], tasks[3], tasks[0]]);
    view(makeClient());
    await screen.findByText('지난 일');

    fireEvent.change(screen.getByLabelText('정렬'), { target: { value: 'due' } });
    const titles = screen
      .getAllByRole('link')
      .map(a => a.textContent ?? '')
      .filter(t => t.includes('일'));
    expect(titles[0]).toContain('지난 일');
    expect(titles[2]).toContain('일정 없는 일');
  });
});

describe('칸반에서 상태 바꾸기', () => {
  beforeEach(() => {
    fetchMyTasks.mockResolvedValue([task('정리')]);
  });

  const openKanban = async () => {
    view(makeClient(), '/?view=kanban');
    await screen.findByText('정리:todo');
  };

  it('진행 중으로 옮기면 묻지 않고 바로 저장한다', async () => {
    changeTask.mockResolvedValue({});
    await openKanban();
    await act(async () => fireEvent.click(screen.getByText('진행 중으로 놓기')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(changeTask).toHaveBeenCalledWith('qc', 'P1', { workStatus: 'doing' });
  });

  it('완료로 옮기면 묻지 않고 저장한 뒤 되돌리기를 준다', async () => {
    changeTask.mockResolvedValue({});
    await openKanban();
    await act(async () => fireEvent.click(screen.getByText('완료로 놓기')));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(changeTask).toHaveBeenCalledWith('qc', 'P1', { workStatus: 'done' });

    await act(async () => fireEvent.click(await screen.findByRole('button', { name: '되돌리기' })));
    // 그사이 남이 바꿨으면 서버가 거절하도록 '아직 완료일 때만' 을 함께 보낸다
    expect(changeTask).toHaveBeenLastCalledWith('qc', 'P1', {
      workStatus: 'todo',
      ifWorkStatus: 'done',
    });
    // 한 번만 무른다. 사라지는 동안 다시 눌러도 또 저장하지 않는다.
    const calls = changeTask.mock.calls.length;
    const again = screen.queryByRole('button', { name: '되돌리기' });
    if (again) await act(async () => fireEvent.click(again));
    expect(changeTask.mock.calls.length).toBe(calls);
  });

  it('저장에 실패하면 되돌리기를 주지 않는다 — 무를 것이 없다', async () => {
    changeTask.mockRejectedValue(new Error('network'));
    await openKanban();
    await act(async () => fireEvent.click(screen.getByText('완료로 놓기')));
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
  });

  it('저장에 실패하면 카드를 원래 열로 되돌린다 — 다시 읽기마저 안 될 때도', async () => {
    // 첫 읽기 뒤로는 응답이 오지 않는다. 다시 읽기에 기대면 카드가 틀린 열에 남는다.
    fetchMyTasks.mockReset();
    fetchMyTasks.mockResolvedValueOnce([task('정리')]).mockReturnValue(new Promise(() => {}));
    let reject!: (err: Error) => void;
    changeTask.mockReturnValue(new Promise((_, r) => (reject = r)));
    await openKanban();
    await act(async () => fireEvent.click(screen.getByText('진행 중으로 놓기')));
    // 응답 전에는 옮긴 자리에 보인다 (React Query 는 다음 틱에 화면을 고친다)
    expect(await screen.findByText('정리:doing')).toBeInTheDocument();

    await act(async () => reject(new Error('network')));
    expect(await screen.findByText('정리:todo')).toBeInTheDocument();
  });
});

describe('팀 보기에서 옮길 때', () => {
  it('담당자 없는 업무가 옮기면서 담당자가 생기면 알린다 — 모르는 새 맡지 않게', async () => {
    fetchBoardTasks.mockResolvedValue([task('주인 없는 일')]);
    changeTask.mockResolvedValue({
      workStatus: 'doing',
      assignee: { id: 'me', name: '나', avatar: null },
      startDate: null,
      dueDate: null,
    });
    view(makeClient(), '/?board=qc&view=kanban');
    await screen.findByText('주인 없는 일:todo');
    await act(async () => fireEvent.click(screen.getByText('진행 중으로 놓기')));
    expect(await screen.findByText(/담당자가 나\(으\)로 정해졌습니다/)).toBeInTheDocument();
  });

  it('원래 담당자가 있으면 알리지 않는다', async () => {
    fetchBoardTasks.mockResolvedValue([
      task('주인 있는 일', { assignee: { id: 'u2', name: '김동료', avatar: null } }),
    ]);
    changeTask.mockResolvedValue({
      workStatus: 'doing',
      assignee: { id: 'u2', name: '김동료', avatar: null },
      startDate: null,
      dueDate: null,
    });
    view(makeClient(), '/?board=qc&view=kanban');
    await screen.findByText('주인 있는 일:todo');
    await act(async () => fireEvent.click(screen.getByText('진행 중으로 놓기')));
    expect(screen.queryByText(/담당자가 .* 정해졌습니다/)).not.toBeInTheDocument();
  });
});

describe('목록 잘림', () => {
  it('서버가 자르는 수만큼 왔으면 더 있을 수 있다고 알린다', async () => {
    fetchMyTasks.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => task(`일 ${i}`, { id: `P${i}` }))
    );
    view(makeClient());
    await screen.findByText('일 0');
    expect(screen.getByText(/업무가 많아/)).toBeInTheDocument();
  });

  it('그보다 적으면 알리지 않는다', async () => {
    fetchMyTasks.mockResolvedValue([task('하나')]);
    view(makeClient());
    await screen.findByText('하나');
    expect(screen.queryByText(/업무가 많아/)).not.toBeInTheDocument();
  });
});

describe('칸반 순서와 상태 이름', () => {
  it('칸반은 마감 빠른 순으로 둔다 — 급한 일이 열 아래에 묻히지 않게', async () => {
    fetchMyTasks.mockResolvedValue([
      task('나중', { id: 'a', dueDate: day(20) }),
      task('없음', { id: 'b' }),
      task('급함', { id: 'c', dueDate: day(1) }),
    ]);
    view(makeClient(), '/?view=kanban');
    await screen.findByText('급함:todo');
    const order = screen.getAllByText(/:todo$/).map(p => p.textContent);
    expect(order).toEqual(['급함:todo', '나중:todo', '없음:todo']);
  });

  it('목록의 상태 배지는 관리자가 바꾼 이름을 따른다', async () => {
    api.fetchWorkStatuses.mockResolvedValue([{ key: 'todo', label: '대기', description: '' }]);
    fetchMyTasks.mockResolvedValue([task('정리')]);
    view(makeClient());
    expect(await screen.findByText('대기')).toBeInTheDocument();
  });
});

describe('일정 지우기', () => {
  beforeEach(() => {
    fetchMyTasks.mockResolvedValue([task('정리', { startDate: day(1), dueDate: day(3) })]);
  });

  it('지운 날짜는 되살릴 길이 없어 먼저 묻고, 취소하면 저장하지 않는다', async () => {
    view(makeClient(), '/?view=kanban');
    await screen.findByText('정리:todo');
    await act(async () => fireEvent.click(screen.getByText('일정 지우기 누름')));
    expect(screen.getByRole('dialog', { name: '일정을 지울까요?' })).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByText('취소')));
    expect(changeTask).not.toHaveBeenCalled();
  });

  it('확인하면 두 날짜를 비운다', async () => {
    changeTask.mockResolvedValue({});
    view(makeClient(), '/?view=kanban');
    await screen.findByText('정리:todo');
    await act(async () => fireEvent.click(screen.getByText('일정 지우기 누름')));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '일정 지우기' })));
    expect(changeTask).toHaveBeenCalledWith('qc', 'P1', { startDate: null, dueDate: null });
  });
});
