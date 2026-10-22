// 업무 게시판 안의 보기 탭.
//
// 보드·간트는 '내 업무' 화면에만 있었다. 한 게시판의 간트를 보려면 네 번을 거치고
// 게시판을 떠나야 했다. 같은 부품을 게시판 안에 두되, 지켜야 하는 선이 있다.
//  1. 업무용으로 켠 게시판에서만 탭이 보인다.
//  2. 고른 보기는 주소에 남는다 — 링크를 주고받고, 뒤로 와도 보던 보기다.
//  3. 업무용이 아닌 게시판은 ?view= 가 붙어 있어도 목록이다.
//  4. 보드로 넘어가도 적어 둔 검색어는 그대로 있다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../api/posts', () => ({
  fetchPostsByType: vi.fn().mockResolvedValue({ posts: [], totalPages: 1, totalCount: 0 }),
}));
vi.mock('../../api/tags', () => ({ getTags: vi.fn().mockResolvedValue([]) }));
// 게시판마다 업무·달력을 따로 켠다
const BOARDS: Record<string, { taskEnabled: boolean; calendarEnabled: boolean }> = {
  work: { taskEnabled: true, calendarEnabled: false },
  plain: { taskEnabled: false, calendarEnabled: false },
  cal: { taskEnabled: false, calendarEnabled: true },
  both: { taskEnabled: true, calendarEnabled: true },
};
vi.mock('../../api/boards', () => ({
  checkUserBoardAccess: vi.fn(async (boardType: string) => ({
    data: {
      board: {
        id: boardType,
        name: boardType,
        description: '',
        taskEnabled: BOARDS[boardType]?.taskEnabled ?? false,
        calendarEnabled: BOARDS[boardType]?.calendarEnabled ?? false,
      },
    },
  })),
  checkBoardManageCapability: vi.fn().mockResolvedValue({ canManage: false }),
}));
// 사이트 전체 스위치. 게시판에서 켜 두어도 사이트에서 끄면 그 보기는 없다.
const FEATURES = vi.hoisted(
  () => ({ 'post.tasks': true, 'tools.calendar': true }) as Record<string, boolean>
);
vi.mock('../../store/features', () => ({ useFeature: (key: string) => FEATURES[key] ?? false }));
vi.mock('../../store/siteSettings', () => ({
  useSiteSettings: (sel: (s: { settings: { defaultPageSize: number } }) => unknown) =>
    sel({ settings: { defaultPageSize: 10 } }),
}));
// 보기 자체는 각자 시험한다. 여기서는 어느 보기가 열렸는지만 본다.
vi.mock('../../components/tasks/BoardTaskViews', () => ({
  BoardTaskViews: ({ boardType, view }: { boardType: string; view: string }) => (
    <div data-testid="task-views">{`${boardType}:${view}`}</div>
  ),
}));
// 달력 화면은 공유 달력과 같은 것이다. 여기서는 어느 게시판으로 열렸는지만 본다.
vi.mock('../components/calendar/CalendarPage', () => ({
  default: ({ boardId, boardTaskEnabled }: { boardId: string; boardTaskEnabled: boolean }) => (
    <div data-testid="board-calendar">{`${boardId}:${boardTaskEnabled ? '업무함께' : '일정만'}`}</div>
  ),
}));

import PostList from './PostList';

function ShowUrl() {
  const loc = useLocation();
  return <div data-testid="url">{loc.pathname + loc.search}</div>;
}

const renderAt = (entry: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <ShowUrl />
        <Routes>
          <Route path="/dashboard/posts/:boardType" element={<PostList />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

const url = () => screen.getByTestId('url').textContent;
const tab = (name: string) => screen.getByRole('button', { name });
const list = () => screen.queryByRole('region', { name: /목록/ });

describe('게시판 안의 보기 탭', () => {
  it('업무용 게시판에서만 보인다', async () => {
    renderAt('/dashboard/posts/work');
    await waitFor(() => expect(tab('보드')).toBeInTheDocument());
    expect(tab('간트')).toBeInTheDocument();
  });

  it('업무용이 아니면 탭이 없다', async () => {
    renderAt('/dashboard/posts/plain');
    await waitFor(() => expect(list()).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '보드' })).toBeNull();
  });

  it('보드를 누르면 주소에 남고 글 목록은 비켜 준다', async () => {
    renderAt('/dashboard/posts/work');
    await waitFor(() => expect(tab('보드')).toBeInTheDocument());

    fireEvent.click(tab('보드'));

    expect(url()).toContain('view=kanban');
    expect(screen.getByTestId('task-views')).toHaveTextContent('work:kanban');
    // 감춰야 한다 — 보이지 않는 목록을 읽어 주면 화면이 두 겹으로 들린다
    expect(list()).toBeNull();
  });

  it('주소로 바로 들어와도 그 보기로 열린다', async () => {
    renderAt('/dashboard/posts/work?view=gantt');
    await waitFor(() => expect(screen.getByTestId('task-views')).toHaveTextContent('work:gantt'));
  });

  it('업무용이 아닌 게시판은 ?view= 가 붙어 있어도 목록이다', async () => {
    renderAt('/dashboard/posts/plain?view=kanban');
    await waitFor(() => expect(list()).toBeInTheDocument());
    expect(screen.queryByTestId('task-views')).toBeNull();
  });

  it('목록으로 돌아오면 주소에서 보기가 빠진다', async () => {
    renderAt('/dashboard/posts/work?view=kanban');
    await waitFor(() => expect(tab('목록')).toBeInTheDocument());

    fireEvent.click(tab('목록'));

    expect(url()).not.toContain('view=');
    await waitFor(() => expect(list()).toBeInTheDocument());
  });

  it('달력을 켠 게시판에만 달력 탭이 있다', async () => {
    renderAt('/dashboard/posts/cal');
    await waitFor(() => expect(tab('달력')).toBeInTheDocument());
    // 업무용이 아니므로 보드·간트는 없다
    expect(screen.queryByRole('button', { name: '보드' })).toBeNull();
  });

  it('업무와 달력을 다 켜면 네 보기가 모두 있다', async () => {
    renderAt('/dashboard/posts/both');
    await waitFor(() => expect(tab('달력')).toBeInTheDocument());
    for (const name of ['목록', '보드', '간트']) {
      expect(tab(name)).toBeInTheDocument();
    }
  });

  it('달력 탭은 그 게시판의 달력을 연다', async () => {
    renderAt('/dashboard/posts/both');
    await waitFor(() => expect(tab('달력')).toBeInTheDocument());

    fireEvent.click(tab('달력'));

    expect(url()).toContain('view=calendar');
    // 업무용 게시판이면 업무 기간도 함께 그린다
    expect(screen.getByTestId('board-calendar')).toHaveTextContent('both:업무함께');
    expect(list()).toBeNull();
  });

  it('업무를 끈 게시판의 달력은 일정만 그린다', async () => {
    renderAt('/dashboard/posts/cal?view=calendar');
    await waitFor(() =>
      expect(screen.getByTestId('board-calendar')).toHaveTextContent('cal:일정만')
    );
  });

  it('달력을 끈 게시판은 ?view=calendar 라도 목록이다', async () => {
    renderAt('/dashboard/posts/work?view=calendar');
    await waitFor(() => expect(list()).toBeInTheDocument());
    expect(screen.queryByTestId('board-calendar')).toBeNull();
  });

  it('고를 보기가 목록뿐이면 탭 줄을 두지 않는다', async () => {
    renderAt('/dashboard/posts/plain');
    await waitFor(() => expect(list()).toBeInTheDocument());
    expect(screen.queryByRole('group', { name: '보기' })).toBeNull();
  });

  it('사이트에서 일정을 끄면 게시판 달력도 없다', async () => {
    FEATURES['tools.calendar'] = false;
    try {
      renderAt('/dashboard/posts/both');
      await waitFor(() => expect(tab('보드')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: '달력' })).toBeNull();
    } finally {
      FEATURES['tools.calendar'] = true;
    }
  });

  it('사이트에서 업무를 끄면 보드·간트가 없다', async () => {
    FEATURES['post.tasks'] = false;
    try {
      renderAt('/dashboard/posts/both');
      await waitFor(() => expect(tab('달력')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: '보드' })).toBeNull();
    } finally {
      FEATURES['post.tasks'] = true;
    }
  });

  it('보드에 다녀와도 적어 둔 검색어는 그대로다', async () => {
    renderAt('/dashboard/posts/work?q=보고서');
    await waitFor(() => expect(screen.getByPlaceholderText(/검색/)).toHaveValue('보고서'));

    fireEvent.click(tab('보드'));
    fireEvent.click(tab('목록'));

    expect(screen.getByPlaceholderText(/검색/)).toHaveValue('보고서');
  });
});
