// client/src/pages/MyTasks.test.tsx
//
// 담당자·업무 상태는 글 상세에서 바뀌는데, 그쪽은 이 목록의 캐시 키를 무효화하지 않는다.
// 전역 staleTime 이 5분이라 그대로 두면 방금 맡은 일이 목록에 뜨지 않고,
// 담당에서 빠진 일이 계속 남는다. 화면을 다시 열 때마다 서버에 다시 묻는지 고정한다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MyTasks from './MyTasks';
import type { MyTask } from '../api/tasks';

const fetchMyTasks = vi.hoisted(() => vi.fn());
vi.mock('../api/tasks', async () => {
  const actual = await vi.importActual<typeof import('../api/tasks')>('../api/tasks');
  return { ...actual, fetchMyTasks };
});

// PageContainer 의 등장 애니메이션은 happy-dom 에서 언마운트 시 AbortError 를 남긴다.
vi.mock('framer-motion', () => ({ motion: new Proxy({}, { get: () => 'div' }) }));

const task = (title: string): MyTask => ({
  id: 'P1',
  title,
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'todo',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** 운영과 같은 기본값 — 전역 staleTime 5분(QueryProvider) */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 },
      mutations: { retry: false },
    },
  });
}

const view = (queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyTasks />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('MyTasks', () => {
  beforeEach(() => vi.clearAllMocks());

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
