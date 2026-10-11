// 글 상세의 업무 영역 중 일정. 칸반·간트 말고도 정확한 날짜를 넣을 곳이 있어야 한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { TaskPanel } from './TaskPanel';
import type { TaskState } from '../../api/tasks';

const api = vi.hoisted(() => ({ changeTask: vi.fn(), fetchWorkStatuses: vi.fn() }));
vi.mock('../../api/tasks', async () => {
  const actual = await vi.importActual<typeof import('../../api/tasks')>('../../api/tasks');
  return { ...actual, ...api };
});

const state = (over: Partial<TaskState> = {}): TaskState => ({
  workStatus: 'todo',
  assignee: null,
  startDate: '2026-10-10',
  dueDate: '2026-10-12',
  ...over,
});

function setup(s: TaskState, editable = true) {
  const onChange = vi.fn();
  renderWithQuery(
    <TaskPanel boardType="qc" postId="P1" state={s} editable={editable} onChange={onChange} />
  );
  return onChange;
}

describe('TaskPanel 일정', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchWorkStatuses.mockResolvedValue([]);
    api.changeTask.mockImplementation(async (_b, _p, change) => ({ ...state(), ...change }));
  });

  const openPicker = async () => {
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: /^일정 .* 바꾸기$/ }))
    );
  };

  it('달력에서 고르고 적용하면 두 날짜만 한 번 보낸다 — 상태·담당자는 건드리지 않는다', async () => {
    const onChange = setup(state());
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: '2026년 10월 14일 수요일' }));
    fireEvent.click(screen.getByRole('button', { name: '2026년 10월 20일 화요일' }));
    expect(api.changeTask).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '적용' })));
    expect(api.changeTask).toHaveBeenCalledTimes(1);
    expect(api.changeTask).toHaveBeenCalledWith('qc', 'P1', {
      startDate: '2026-10-14',
      dueDate: '2026-10-20',
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2026-10-20' }));
  });

  it('일정이 없으면 단추가 일정 정하기로 보인다', () => {
    setup(state({ startDate: null, dueDate: null }));
    expect(screen.getByRole('button', { name: '일정 정하기' })).toBeInTheDocument();
  });

  it('일정 지우기는 먼저 묻는다', async () => {
    setup(state());
    await openPicker();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '일정 지우기' })));
    const dialog = screen.getByRole('dialog', { name: '일정을 지울까요?' });
    expect(api.changeTask).not.toHaveBeenCalled();

    await act(async () =>
      fireEvent.click(within(dialog).getByRole('button', { name: '일정 지우기' }))
    );
    expect(api.changeTask).toHaveBeenCalledWith('qc', 'P1', { startDate: null, dueDate: null });
  });

  it('바꿀 수 없는 사람에게는 날짜를 글로만 보여 준다', () => {
    setup(state(), false);
    expect(screen.queryByLabelText('마감일')).not.toBeInTheDocument();
    expect(screen.getByText('2026-10-10 ~ 2026-10-12')).toBeInTheDocument();
  });

  it('상태·담당 없이 일정만 있어도 읽기 전용으로 보여 준다', () => {
    setup(state({ workStatus: 'none' }), false);
    expect(screen.getByText('2026-10-10 ~ 2026-10-12')).toBeInTheDocument();
  });
});
