// client/src/components/boards/WorkStatusFilter.test.tsx
// 상태 필터의 선택 규칙.
//
// 여러 개를 함께 고를 수 있어야 "할 일 + 진행 중"(아직 안 끝난 것)을 만들 수 있다.
// 단일 선택으로 바뀌면 화면상으로는 멀쩡해 보이지만 그 조합이 사라진다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkStatusFilter } from './WorkStatusFilter';

describe('선택', () => {
  it('아무것도 안 고르면 전체가 눌린 상태다', () => {
    render(<WorkStatusFilter selected={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('고른 것에 더한다 — 갈아치우지 않는다', () => {
    const onChange = vi.fn();
    render(<WorkStatusFilter selected={['todo']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '진행 중' }));
    expect(onChange).toHaveBeenCalledWith(['todo', 'doing']);
  });

  it('이미 고른 것을 다시 누르면 빠진다', () => {
    const onChange = vi.fn();
    render(<WorkStatusFilter selected={['todo', 'doing']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '할 일' }));
    expect(onChange).toHaveBeenCalledWith(['doing']);
  });

  it('전체는 선택을 비운다', () => {
    const onChange = vi.fn();
    render(<WorkStatusFilter selected={['done']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("'없음' 은 고를 수 없다 — 전체와 사실상 같은 선택지를 늘리지 않는다", () => {
    render(<WorkStatusFilter selected={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '없음' })).toBeNull();
  });
});
