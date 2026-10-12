// 달력에 얹는 내 업무. 일정 있는 것만, 마감일 당일까지 칠하고, 지난 마감은 붉게, 끌어 바꾸지 못하게.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MyTask } from '../../../../api/tasks';
import { useFeatures } from '../../../../store/features';
import { useTaskEvents } from './useTaskEvents';

const fetchMyTasks = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/tasks', async () => {
  const actual =
    await vi.importActual<typeof import('../../../../api/tasks')>('../../../../api/tasks');
  return { ...actual, fetchMyTasks };
});

const task = (id: string, over: Partial<MyTask>): MyTask => ({
  id,
  title: `업무 ${id}`,
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

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTaskEvents(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useTaskEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFeatures.getState().set({});
  });

  it('일정이 있는 업무만, 끝 날짜를 하루 넘겨(종일 일정 규칙) 읽기 전용으로 만든다', async () => {
    fetchMyTasks.mockResolvedValue([
      task('a', { startDate: '2099-10-01', dueDate: '2099-10-03' }),
      task('b', {}),
    ]);
    const { result } = run();
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({
      id: 'task:a',
      start: '2099-10-01',
      end: '2099-10-04',
      allDay: true,
      editable: false,
      extendedProps: { taskLink: '/dashboard/posts/qc/a' },
    });
  });

  it('마감이 지난 업무는 붉게 칠한다', async () => {
    fetchMyTasks.mockResolvedValue([
      task('late', { dueDate: '2000-01-01' }),
      task('later', { dueDate: '2099-01-01' }),
    ]);
    const { result } = run();
    await waitFor(() => expect(result.current).toHaveLength(2));
    const color = (id: string) => result.current.find(e => e.id === `task:${id}`)?.backgroundColor;
    expect(color('late')).not.toBe(color('later'));
  });

  it('업무 기능을 끈 사이트에서는 묻지도 않는다', async () => {
    useFeatures.getState().set({ 'post.tasks': false });
    const { result } = run();
    await new Promise(r => setTimeout(r, 20));
    expect(fetchMyTasks).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('자정을 넘기면 지각 색으로 바뀐다 — 밤새 켜 둔 달력도 따라온다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // 오늘이 마감인 업무. 자정을 넘기는 순간부터 '지난 마감' 이다.
      vi.setSystemTime(new Date(2099, 5, 10, 23, 59, 30));
      const due = '2099-06-10';
      fetchMyTasks.mockResolvedValue([task('n', { dueDate: due })]);
      const { result } = run();
      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(result.current[0].backgroundColor).toBe('#f97316');

      await act(async () => {
        vi.advanceTimersByTime(90_000); // 자정 통과
      });

      await waitFor(() => expect(result.current[0].backgroundColor).toBe('#e11d48'));
    } finally {
      vi.useRealTimers();
    }
  });
});
