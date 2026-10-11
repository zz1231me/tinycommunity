// 화면을 켜 둔 채 자정을 넘기면 '오늘' 이 바뀌어야 D-day 가 어제 기준에 머물지 않는다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToday } from './useToday';

describe('useToday', () => {
  afterEach(() => vi.useRealTimers());

  it('자정을 넘기면 새 날이 된다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 23, 59, 0));
    const { result } = renderHook(() => useToday());
    expect(result.current).toEqual(new Date(2026, 9, 11));

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(result.current).toEqual(new Date(2026, 9, 12));
  });
});
