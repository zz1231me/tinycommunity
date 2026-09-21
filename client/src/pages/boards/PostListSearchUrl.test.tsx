// 목록의 검색 조건이 주소에 남는지.
//
// 페이지 번호는 주소(?page=)에 있었는데 검색어는 컴포넌트 안에만 있었다. 그래서 검색해서
// 찾은 글을 열었다가 뒤로 오면 검색이 통째로 날아가, 같은 말을 다시 입력해야 했다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// happy-dom 에서 애니메이션이 취소되면 잡히지 않는 AbortError 를 남긴다
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../api/posts', () => ({
  fetchPostsByType: vi.fn().mockResolvedValue({ posts: [], totalPages: 1, totalCount: 0 }),
}));
vi.mock('../../api/tags', () => ({ getTags: vi.fn().mockResolvedValue([]) }));
vi.mock('../../api/boards', () => ({
  checkUserBoardAccess: vi.fn().mockResolvedValue({ canRead: true, canWrite: true }),
  checkBoardManageCapability: vi.fn().mockResolvedValue({ canManage: false }),
}));
vi.mock('../../store/features', () => ({ useFeature: () => false }));
vi.mock('../../store/siteSettings', () => ({
  useSiteSettings: (sel: (s: { settings: { defaultPageSize: number } }) => unknown) =>
    sel({ settings: { defaultPageSize: 10 } }),
}));

import PostList from './PostList';

/** 지금 주소를 화면에 적어 두고 검사에 쓴다 */
function ShowUrl() {
  const loc = useLocation();
  return <div data-testid="url">{loc.pathname + loc.search}</div>;
}

const renderAt = (entry: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <ShowUrl />
        <Routes>
          <Route path="/dashboard/posts/:boardType" element={<PostList />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

const url = () => screen.getByTestId('url').textContent;
const searchBox = () => screen.getByPlaceholderText(/검색/);

describe('목록의 검색 조건', () => {
  it('주소에 담겨 오면 검색칸을 그 값으로 채운다 — 뒤로가기 복원', async () => {
    renderAt('/dashboard/posts/free?q=보고서');
    await waitFor(() => expect(searchBox()).toHaveValue('보고서'));
  });

  it('검색하면 주소에 남는다', async () => {
    vi.useFakeTimers();
    try {
      renderAt('/dashboard/posts/free');
      fireEvent.change(searchBox(), { target: { value: '보고서' } });
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(url()).toContain('q=%EB%B3%B4%EA%B3%A0%EC%84%9C');
    } finally {
      vi.useRealTimers();
    }
  });

  it('검색을 지우면 주소에서도 빠진다', async () => {
    vi.useFakeTimers();
    try {
      renderAt('/dashboard/posts/free?q=보고서');
      fireEvent.change(searchBox(), { target: { value: '' } });
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(url()).not.toContain('q=');
    } finally {
      vi.useRealTimers();
    }
  });
});
