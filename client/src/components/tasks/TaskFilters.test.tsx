// 범위 고르개의 '전체 업무'.
//
// 업무는 지금까지 '담당자가 나인 것' 아니면 '게시판 하나' 로만 볼 수 있었다. 공용으로
// 쓰려면 한 장이 필요하다. 다만 이 항목은 관리자가 끌 수 있어야 하고, 꺼져 있으면
// 고를 수조차 없어야 한다(서버도 같은 스위치로 그 길을 막는다).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskFilters } from './TaskFilters';
import { useFeatures } from '../../store/features';
import type { TaskFilter } from './taskViews';

const EMPTY_FILTER: TaskFilter = { query: '', boardType: '', due: null, priority: null };

const setFeature = (enabled: boolean) =>
  useFeatures.setState({ features: { 'post.tasksShared': enabled }, hidden: [], loaded: true });

const renderFilters = (scope = '') => {
  const onScopeChange = vi.fn();
  render(
    <TaskFilters
      scope={scope}
      scopes={[{ id: 'qc', name: '품질' }]}
      onScopeChange={onScopeChange}
      filter={EMPTY_FILTER}
      onFilterChange={() => {}}
      boards={[]}
      dueCounts={{ overdue: 0, today: 0, week: 0 }}
    />
  );
  return onScopeChange;
};

const scopeSelect = () => screen.getByRole('combobox', { name: '보는 범위' });

describe('보는 범위', () => {
  beforeEach(() => setFeature(true));

  it('켜져 있으면 전체 업무를 고를 수 있다', () => {
    const onScopeChange = renderFilters();

    expect(screen.getByRole('option', { name: '전체 업무' })).toBeInTheDocument();

    fireEvent.change(scopeSelect(), { target: { value: '*' } });
    expect(onScopeChange).toHaveBeenCalledWith('*');
  });

  it('꺼져 있으면 그 항목이 아예 없다 — 숨기는 게 아니라 고를 수 없어야 한다', () => {
    setFeature(false);
    renderFilters();

    expect(screen.queryByRole('option', { name: '전체 업무' })).not.toBeInTheDocument();
    // 나머지 범위는 그대로다 — 양성 대조
    expect(screen.getByRole('option', { name: '내 업무' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '품질 전체' })).toBeInTheDocument();
  });
});
