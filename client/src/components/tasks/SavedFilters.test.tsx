// 저장된 업무 필터.
//
// 지켜야 할 선은 ① 저장해 둔 것이 없으면 그렇게 말한다 ② 고르면 조건을 그대로 넘긴다
// ③ 지금 조건을 이름과 함께 보낸다 ④ 이름 없이 저장하지 않는다 ⑤ 지울 수 있다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SavedFilters } from './SavedFilters';
import { renderWithQuery } from '../../test/renderWithQuery';
import type { SavedTaskFilter, SavedTaskFilterInput } from '../../api/taskFilters';

const api = vi.hoisted(() => ({
  fetchTaskFilters: vi.fn(),
  saveTaskFilter: vi.fn(),
  deleteTaskFilter: vi.fn(),
}));
vi.mock('../../api/taskFilters', () => api);

const urgent: SavedTaskFilter = {
  id: 1,
  name: '긴급 이번 주',
  scope: '',
  query: '견적',
  boardType: 'notice',
  due: 'week',
  priority: 'urgent',
  sort: 'priority',
};

const CURRENT: SavedTaskFilterInput = {
  name: '',
  scope: 'qc',
  query: '',
  boardType: '',
  due: 'today',
  priority: 'high',
  sort: 'due',
};

const show = () => {
  const onApply = vi.fn();
  renderWithQuery(<SavedFilters current={CURRENT} onApply={onApply} />);
  return onApply;
};

const openMenu = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /저장된 필터/ }));

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchTaskFilters.mockResolvedValue([]);
  api.saveTaskFilter.mockImplementation(async (input: SavedTaskFilterInput) => ({
    ...input,
    id: 9,
  }));
  api.deleteTaskFilter.mockResolvedValue(undefined);
});

describe('저장된 필터', () => {
  it('저장해 둔 것이 없으면 그렇게 말한다', async () => {
    show();
    await openMenu();
    expect(screen.getByText('저장해 둔 필터가 없습니다.')).toBeInTheDocument();
  });

  it('고르면 조건을 그대로 넘긴다', async () => {
    api.fetchTaskFilters.mockResolvedValue([urgent]);
    const onApply = show();
    await openMenu();

    fireEvent.click(await screen.findByRole('button', { name: '긴급 이번 주' }));

    expect(onApply).toHaveBeenCalledWith(urgent);
  });

  it('지금 조건을 이름과 함께 저장한다 — 범위·정렬도 함께', async () => {
    show();
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '지금 조건을 저장' }));
    fireEvent.change(screen.getByLabelText('필터 이름'), { target: { value: ' 내 급한 일 ' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(api.saveTaskFilter).toHaveBeenCalledWith({ ...CURRENT, name: '내 급한 일' })
    );
  });

  it('이름이 비면 저장하지 않는다', async () => {
    show();
    await openMenu();
    fireEvent.click(screen.getByRole('button', { name: '지금 조건을 저장' }));

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(api.saveTaskFilter).not.toHaveBeenCalled();
  });

  it('지운다', async () => {
    api.fetchTaskFilters.mockResolvedValue([urgent]);
    show();
    await openMenu();

    fireEvent.click(await screen.findByRole('button', { name: '긴급 이번 주 지우기' }));

    await waitFor(() => expect(api.deleteTaskFilter).toHaveBeenCalledWith(1));
  });

  it('지금 조건과 똑같은 것이 저장돼 있으면 그 이름을 보여 준다', async () => {
    api.fetchTaskFilters.mockResolvedValue([{ ...urgent, ...CURRENT, name: '지금 이것' }]);
    show();

    expect(await screen.findByRole('button', { name: /지금 이것/ })).toBeInTheDocument();
  });

  it('조건이 하나라도 다르면 이름을 보여 주지 않는다 — 손댄 뒤에도 남으면 거짓말이 된다', async () => {
    api.fetchTaskFilters.mockResolvedValue([
      { ...urgent, ...CURRENT, name: '거의 같은 것', priority: 'urgent' },
    ]);
    show();

    expect(await screen.findByRole('button', { name: /저장된 필터/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /거의 같은 것/ })).not.toBeInTheDocument();
  });

  it('ESC 로 닫힌다', async () => {
    api.fetchTaskFilters.mockResolvedValue([urgent]);
    show();
    await openMenu();
    expect(await screen.findByRole('button', { name: '긴급 이번 주' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '긴급 이번 주' })).not.toBeInTheDocument()
    );
  });
});
