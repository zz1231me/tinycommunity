// 하위 업무 패널.
//
// 지켜야 할 선: ① 붙은 것도 없고 붙일 권한도 없으면 빈 칸을 두지 않는다
// ② 몇 개 중 몇 개가 끝났는지 센다 ③ 한 줄 적어 넣으면 바로 붙는다
// ④ 떼어내기는 한 번 묻는다(지우는 것과 다르다) ⑤ 볼 수만 있는 사람에게는 손댈 거리를 주지 않는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubtaskPanel } from './SubtaskPanel';
import { renderWithQuery } from '../../test/renderWithQuery';
import type { MyTask } from '../../api/tasks';

const api = vi.hoisted(() => ({
  fetchSubtasks: vi.fn(),
  addSubtask: vi.fn(),
  detachSubtask: vi.fn(),
}));
vi.mock('../../api/tasks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/tasks')>()),
  ...api,
}));
vi.mock('../tasks/useStatusLabel', () => ({
  useStatusLabel: () => (s: string) => ({ todo: '할 일', doing: '진행 중', done: '완료' })[s] ?? s,
}));

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: 'S1',
  title: 'A 라인 점검',
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'todo',
  priority: 'none',
  assignee: null,
  canEdit: true,
  startDate: null,
  dueDate: null,
  showOnCalendar: true,
  parentTaskId: null,
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
  ...over,
});

const show = (editable = true) =>
  renderWithQuery(
    <MemoryRouter>
      <SubtaskPanel boardType="qc" postId="P1" editable={editable} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSubtasks.mockResolvedValue([]);
  api.addSubtask.mockImplementation(async (_b: string, _p: string, body: { title: string }) =>
    task({ id: 'new', title: body.title })
  );
  api.detachSubtask.mockResolvedValue(undefined);
});

describe('하위 업무 패널', () => {
  it('붙은 것도 없고 붙일 권한도 없으면 아무것도 그리지 않는다', async () => {
    const { container } = show(false);
    await waitFor(() => expect(api.fetchSubtasks).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('몇 개 중 몇 개가 끝났는지 센다', async () => {
    api.fetchSubtasks.mockResolvedValue([
      task({ id: 'a', title: '끝난 일', workStatus: 'done' }),
      task({ id: 'b', title: '남은 일' }),
    ]);
    show();

    expect(await screen.findByText('1/2 끝남')).toBeInTheDocument();
  });

  it('한 줄 적어 넣으면 붙고 입력칸이 비워진다', async () => {
    show();
    const input = await screen.findByLabelText('하위 업무 제목');
    fireEvent.change(input, { target: { value: '  B 라인 점검  ' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() =>
      expect(api.addSubtask).toHaveBeenCalledWith('qc', 'P1', { title: 'B 라인 점검' })
    );
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  });

  it('제목이 비면 붙이지 않는다', async () => {
    show();
    await screen.findByLabelText('하위 업무 제목');
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(api.addSubtask).not.toHaveBeenCalled();
  });

  it('떼어내기는 한 번 묻는다 — 지우는 것과 다르다', async () => {
    api.fetchSubtasks.mockResolvedValue([task()]);
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'A 라인 점검 떼어내기' }));

    expect(await screen.findByText(/따로 선 업무로 남습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '떼어내기' }));

    await waitFor(() => expect(api.detachSubtask).toHaveBeenCalledWith('qc', 'P1', 'S1'));
  });

  it('묻는 말에 아니라고 하면 떼어 내지 않는다', async () => {
    api.fetchSubtasks.mockResolvedValue([task()]);
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'A 라인 점검 떼어내기' }));
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));

    await waitFor(() => expect(api.detachSubtask).not.toHaveBeenCalled());
  });

  it('볼 수만 있는 사람에게는 손댈 거리를 주지 않는다', async () => {
    api.fetchSubtasks.mockResolvedValue([task()]);
    show(false);

    expect(await screen.findByText('A 라인 점검')).toBeInTheDocument();
    expect(screen.queryByLabelText('하위 업무 제목')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /떼어내기/ })).not.toBeInTheDocument();
  });
});
