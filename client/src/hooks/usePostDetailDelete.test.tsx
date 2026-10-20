// 글을 지운 뒤 다른 화면이 그 글을 계속 들고 있지 않은지.
//
// 업무 게시판에서 하위 업무('할 일을 한 줄로')를 적으면 글이 하나 생긴다. 그 글을
// 지우면 서버 쪽은 바로 정리된다 — 상위 글의 하위 목록에서 빠지고, 열면 404 다.
// 그런데 화면에는 그 줄이 남아 있었고, 누르면 '없는 게시물' 이 떴다.
//
// 지우는 쪽이 React Query 캐시를 하나도 무효화하지 않았기 때문이다. 하위 목록·
// 내 업무·칸반·간트·게시판 목록이 모두 ['tasks' …]·['boards' …] 키로 캐시되어 있는데,
// 지운 뒤 그대로 남아 유령 줄이 됐다.
//
// 그래서 '지우면 그 키들이 무효가 되는가' 를 고정한다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({
  fetchPostById: vi.fn(),
  deletePost: vi.fn(),
  verifySecretPost: vi.fn(),
  toggleLike: vi.fn(),
}));
vi.mock('../api/posts', () => api);

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: '/dashboard/posts/work/CHILD1', state: null, search: '' }),
  };
});

vi.mock('../store/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: '나', role: 'admin' },
    isAdmin: true,
    getUserId: () => 'u1',
    getUserName: () => '나',
  }),
}));

import { usePostDetail } from './usePostDetail';
import { taskKeys, boardKeys } from '../api/queryKeys';

const POST = {
  id: 'CHILD1',
  boardType: 'work',
  title: '특이사항 메모',
  content: '<p>x</p>',
  author: '나',
  UserId: 'u1',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  attachments: [],
  viewer: { canManage: true, liked: false, likeCount: 0, scrapped: false },
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 지우기 전에 이미 캐시에 들어 있던 목록들
  client.setQueryData(taskKeys.subtasks('work', 'PARENT1'), [{ id: 'CHILD1' }]);
  client.setQueryData(taskKeys.mine('todo,doing'), [{ id: 'CHILD1' }]);
  client.setQueryData(boardKeys.posts('work', {}), { posts: [{ id: 'CHILD1' }] });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

/** 그 키가 '다시 받아와야 하는 상태' 가 됐는지 */
const stale = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchPostById.mockResolvedValue(POST);
  api.deletePost.mockResolvedValue(undefined);
});

describe('글을 지운 뒤', () => {
  it('하위 업무·내 업무·게시판 목록이 모두 다시 받아오게 된다', async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => usePostDetail({ boardType: 'work', id: 'CHILD1' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.post).toBeTruthy());

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(api.deletePost).toHaveBeenCalledWith('work', 'CHILD1');
    expect(stale(client, taskKeys.subtasks('work', 'PARENT1'))).toBe(true);
    expect(stale(client, taskKeys.mine('todo,doing'))).toBe(true);
    expect(stale(client, boardKeys.posts('work', {}))).toBe(true);
  });

  it('지우지 않으면 그대로 둔다 — 양성 대조', async () => {
    // 이것이 없으면 '언제나 전부 무효화' 하는 구현도 위를 통과한다
    const { client, wrapper } = setup();
    const { result } = renderHook(() => usePostDetail({ boardType: 'work', id: 'CHILD1' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.post).toBeTruthy());

    expect(stale(client, taskKeys.subtasks('work', 'PARENT1'))).toBe(false);
    expect(stale(client, taskKeys.mine('todo,doing'))).toBe(false);
  });

  it('삭제가 실패하면 목록을 건드리지 않는다', async () => {
    api.deletePost.mockRejectedValue(new Error('권한 없음'));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => usePostDetail({ boardType: 'work', id: 'CHILD1' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.post).toBeTruthy());

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(stale(client, taskKeys.mine('todo,doing'))).toBe(false);
  });
});
