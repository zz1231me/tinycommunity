// 목록 머리글의 글 수는 알 때만 적는다.
//
// 서버에 닿지 못하면 개수를 모르는데도 "총 0개" 라고 단정해, 연결 오류 안내 바로 위에서
// 게시판이 비어 있다고 잘못 알렸다. 첫 로딩 중에도 같은 0이 잠깐 스쳤다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchPostsByType = vi.fn();
vi.mock('../../api/posts', () => ({
  fetchPostsByType: (...a: unknown[]) => fetchPostsByType(...a),
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

const renderList = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/dashboard/posts/free']}>
        <Routes>
          <Route path="/dashboard/posts/:boardType" element={<PostList />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('목록 머리글의 글 수', () => {
  it('연결이 끊기면 개수를 적지 않는다', async () => {
    fetchPostsByType.mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    renderList();
    await waitFor(() => expect(screen.getByText(/서버에 연결할 수 없습니다/)).toBeInTheDocument());
    expect(screen.queryByText(/총 \d+개/)).not.toBeInTheDocument();
  });

  it('목록이 오면 그 개수를 적는다', async () => {
    fetchPostsByType.mockResolvedValue({
      posts: [],
      pagination: { currentPage: 1, totalPages: 1, totalCount: 7, limit: 10 },
    });
    renderList();
    await waitFor(() => expect(screen.getByText(/총 7개/)).toBeInTheDocument());
  });
});
