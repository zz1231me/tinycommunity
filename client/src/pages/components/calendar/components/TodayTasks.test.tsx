// 첫 화면의 '오늘 할 일'.
//
// 지켜야 할 선: ① 마감이 지났거나 오늘인 것만 ② 지난 것이 먼저 ③ 하나도 없으면
// 아예 그리지 않는다(첫 화면은 할 일이 있을 때만 말을 건다) ④ 기능이 꺼져 있으면 묻지도 않는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodayTasks } from './TodayTasks';
import { renderWithQuery } from '../../../../test/renderWithQuery';
import { useFeatures } from '../../../../store/features';
import type { MyTask } from '../../../../api/tasks';

const api = vi.hoisted(() => ({ fetchMyTasks: vi.fn() }));
vi.mock('../../../../api/tasks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/tasks')>()),
  ...api,
}));

const today = new Date();
const day = (offset: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: 'T1',
  title: '할 일',
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'todo',
  priority: 'none',
  assignee: null,
  canEdit: true,
  startDate: null,
  dueDate: day(0),
  showOnCalendar: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const show = () =>
  renderWithQuery(
    <MemoryRouter>
      <TodayTasks />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useFeatures.setState({ features: { 'post.tasks': true } as never, hidden: [] });
  api.fetchMyTasks.mockResolvedValue([]);
});

describe('오늘 할 일', () => {
  it('마감이 지났거나 오늘인 것만, 지난 것부터 보여 준다', async () => {
    api.fetchMyTasks.mockResolvedValue([
      task({ id: 'a', title: '오늘 마감', dueDate: day(0) }),
      task({ id: 'b', title: '사흘 지남', dueDate: day(-3) }),
      task({ id: 'c', title: '다음 주', dueDate: day(7) }),
      task({ id: 'd', title: '마감 없음', dueDate: null }),
    ]);
    show();

    const rows = await screen.findAllByRole('link');
    const titles = rows.map(r => r.textContent ?? '').filter(t => !t.includes('전체 보기'));
    expect(titles[0]).toContain('사흘 지남');
    expect(titles[1]).toContain('오늘 마감');
    expect(titles.join(' ')).not.toContain('다음 주');
    expect(titles.join(' ')).not.toContain('마감 없음');
  });

  it('끝낸 일은 급한 것으로 치지 않는다', async () => {
    api.fetchMyTasks.mockResolvedValue([
      task({ id: 'done', title: '끝낸 일', workStatus: 'done', dueDate: day(-2) }),
    ]);
    const { container } = show();

    await waitFor(() => expect(api.fetchMyTasks).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('하나도 없으면 아예 그리지 않는다', async () => {
    const { container } = show();
    await waitFor(() => expect(api.fetchMyTasks).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('기능이 꺼져 있으면 묻지도 않는다', () => {
    useFeatures.setState({ features: { 'post.tasks': false } as never, hidden: [] });
    const { container } = show();

    expect(api.fetchMyTasks).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('많으면 여섯 건까지만 보이고 나머지는 수로 알린다', async () => {
    api.fetchMyTasks.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => task({ id: `t${i}`, title: `일 ${i}`, dueDate: day(-1) }))
    );
    show();

    expect(await screen.findByText('외 3건')).toBeInTheDocument();
  });
});
