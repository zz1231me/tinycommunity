// 일정 달력. 고르는 동안에는 저장하지 않고 '적용' 에서 한 번만 넘긴다.
// 기본 날짜 칸은 연도를 치는 동안 0002년·0020년… 을 하나씩 저장했다.

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DateRangeCalendar } from './DateRangeCalendar';
import type { Schedule } from './taskViews';

function setup(value: Schedule = { startDate: '2026-10-10', dueDate: '2026-10-12' }) {
  const props = { onApply: vi.fn(), onCancel: vi.fn(), onClear: vi.fn() };
  render(<DateRangeCalendar value={value} {...props} />);
  return props;
}

const day = (label: string) => screen.getByRole('button', { name: label });

describe('DateRangeCalendar', () => {
  it('저장된 일정이 있는 달을 열고 요약을 보여 준다', () => {
    setup();
    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
    expect(screen.getByText('10월 10일(토) ~ 10월 12일(월)')).toBeInTheDocument();
    expect(day('2026년 10월 10일 토요일')).toHaveAttribute('aria-pressed', 'true');
  });

  it('두 번 눌러 기간을 고르고, 적용할 때 한 번만 두 날짜를 넘긴다', () => {
    const { onApply } = setup();
    fireEvent.click(day('2026년 10월 14일 수요일'));
    fireEvent.click(day('2026년 10월 20일 화요일'));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('10월 14일(수) ~ 10월 20일(화)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ startDate: '2026-10-14', dueDate: '2026-10-20' });
  });

  it('취소하면 아무것도 넘기지 않는다', () => {
    const { onApply, onCancel } = setup();
    fireEvent.click(day('2026년 10월 14일 수요일'));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('일정이 없으면 고르기 전까지 적용할 수 없고, 지우기도 없다', () => {
    setup({ startDate: null, dueDate: null });
    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '일정 지우기' })).not.toBeInTheDocument();
  });

  it('빠른 선택은 마감을 정한다', () => {
    const { onApply } = setup({ startDate: null, dueDate: null });
    fireEvent.click(screen.getByRole('button', { name: '내일' }));
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(onApply).toHaveBeenCalledWith({ startDate: ymd, dueDate: ymd });
  });

  it('지우기는 부른 쪽에 맡긴다(부른 쪽이 한 번 더 묻는다)', () => {
    const { onClear, onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: '일정 지우기' }));
    expect(onClear).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('방향키로 날을 옮기고, 달 끝을 넘으면 달도 넘어간다', async () => {
    setup({ startDate: '2026-10-31', dueDate: '2026-10-31' });
    const start = day('2026년 10월 31일 토요일');
    expect(start).toHaveAttribute('tabindex', '0');
    start.focus();
    await act(async () => fireEvent.keyDown(start, { key: 'ArrowRight' }));
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();
    expect(document.activeElement).toBe(day('2026년 11월 1일 일요일'));
  });

  it('PageDown 은 한 달 뒤로', async () => {
    setup();
    const start = day('2026년 10월 10일 토요일');
    start.focus();
    await act(async () => fireEvent.keyDown(start, { key: 'PageDown' }));
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();
    expect(document.activeElement).toBe(day('2026년 11월 10일 화요일'));
  });
});
