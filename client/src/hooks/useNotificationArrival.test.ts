// client/src/hooks/useNotificationArrival.test.ts
//
// 알림이 도착하면 관련 화면이 스스로 다시 읽게 하는 연결.
// 이것이 없어서 공격을 받거나 도전장이 와도 새로고침을 해야 화면이 바뀌었다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotificationArrival } from './useNotificationArrival';
import { useNotificationStore } from '../store/notifications';
import type { Notification } from '../api/notifications';

const notice = (id: number, type: Notification['type']): Notification => ({
  id,
  type,
  message: '알림',
  link: null,
  relatedId: null,
  isRead: false,
  createdAt: new Date().toISOString(),
});

afterEach(() => {
  act(() => useNotificationStore.setState({ lastArrived: null }));
});

describe('알림 도착 연결', () => {
  it('원하는 종류가 오면 부른다', () => {
    const onArrive = vi.fn();
    renderHook(() => useNotificationArrival(['ATTACK'], onArrive));

    act(() => useNotificationStore.setState({ lastArrived: notice(1, 'ATTACK') }));
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it('다른 종류에는 부르지 않는다 — 음성 대조', () => {
    const onArrive = vi.fn();
    renderHook(() => useNotificationArrival(['ATTACK'], onArrive));

    act(() => useNotificationStore.setState({ lastArrived: notice(2, 'COMMENT') }));
    expect(onArrive).not.toHaveBeenCalled();
  });

  it('다시 그려져도 같은 알림으로 두 번 부르지 않는다', () => {
    const onArrive = vi.fn();
    const { rerender } = renderHook(() => useNotificationArrival(['DUEL'], onArrive));

    act(() => useNotificationStore.setState({ lastArrived: notice(3, 'DUEL') }));
    rerender();
    rerender();
    expect(onArrive).toHaveBeenCalledTimes(1);

    act(() => useNotificationStore.setState({ lastArrived: notice(4, 'DUEL') }));
    expect(onArrive).toHaveBeenCalledTimes(2);
  });
});
