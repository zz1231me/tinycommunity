// client/src/hooks/useNotificationArrival.test.ts
//
// 알림이 도착하면 관련 화면이 스스로 다시 읽게 하는 연결.
// 이것이 없어서 공격을 받거나 도전장이 와도 새로고침을 해야 화면이 바뀌었다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotificationArrival } from './useNotificationArrival';
import { useNotificationStore } from '../store/notifications';
import type { Notification } from '../api/notifications';

const arrive = (type: Notification['type']) =>
  act(() =>
    useNotificationStore.setState(s => ({
      arrivals: { ...s.arrivals, [type]: (s.arrivals[type] ?? 0) + 1 },
    }))
  );

afterEach(() => {
  act(() => useNotificationStore.setState({ arrivals: {} }));
});

describe('알림 도착 연결', () => {
  it('원하는 종류가 오면 부른다', () => {
    const onArrive = vi.fn();
    renderHook(() => useNotificationArrival(['ATTACK'], onArrive));

    arrive('ATTACK');
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it('다른 종류에는 부르지 않는다 — 음성 대조', () => {
    const onArrive = vi.fn();
    renderHook(() => useNotificationArrival(['ATTACK'], onArrive));

    arrive('COMMENT');
    expect(onArrive).not.toHaveBeenCalled();
  });

  it('다시 그려져도 같은 도착으로 두 번 부르지 않는다', () => {
    const onArrive = vi.fn();
    const { rerender } = renderHook(() => useNotificationArrival(['DUEL'], onArrive));

    arrive('DUEL');
    rerender();
    rerender();
    expect(onArrive).toHaveBeenCalledTimes(1);

    arrive('DUEL');
    expect(onArrive).toHaveBeenCalledTimes(2);
  });

  it('화면을 열기 전에 온 것은 신호가 아니다', () => {
    // 다른 화면에 있을 때 온 도전장 때문에, 대결 판을 열자마자 한 번 더 읽을 이유는 없다
    arrive('DUEL');
    const onArrive = vi.fn();
    renderHook(() => useNotificationArrival(['DUEL'], onArrive));
    expect(onArrive).not.toHaveBeenCalled();
  });
});
