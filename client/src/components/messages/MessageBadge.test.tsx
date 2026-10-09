// 헤더의 안 읽은 수를 얼마나 자주 묻는가.
//
// 새 메시지는 SSE 알림이 먼저 알려 준다. 그런데도 1 분마다 묻고 있었다 — 사람 수만큼
// 쌓이는 헛된 요청이다. 연결이 살아 있으면 주기를 늦추고, 알림이 오는 순간 다시 센다.
// 연결이 끊겼을 때는 이 주기가 유일한 수단이므로 짧게 되돌아가야 한다.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageBadge } from './MessageBadge';
import { useNotificationStore } from '../../store/notifications';

const fetchUnreadMessageCount = vi.hoisted(() => vi.fn());
vi.mock('../../api/messages', () => ({ fetchUnreadMessageCount }));
vi.mock('../../store/features', () => ({ useFeature: () => true }));

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MessageBadge />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchUnreadMessageCount.mockResolvedValue(0);
  useNotificationStore.setState({ arrivals: {}, isLive: false });
});

afterEach(() => {
  vi.useRealTimers();
  useNotificationStore.setState({ arrivals: {}, isLive: false });
});

describe('안 읽은 수를 다시 세는 주기', () => {
  it('알림이 끊겨 있으면 1 분마다 묻는다 — 그때는 이것 말고 수단이 없다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show();
    await waitFor(() => expect(fetchUnreadMessageCount).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(fetchUnreadMessageCount).toHaveBeenCalledTimes(2);
  });

  it('알림이 살아 있으면 1 분에는 묻지 않는다', async () => {
    useNotificationStore.setState({ isLive: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show();
    await waitFor(() => expect(fetchUnreadMessageCount).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(fetchUnreadMessageCount).toHaveBeenCalledTimes(1);
  });
});

describe('알림이 오면', () => {
  it('주기를 기다리지 않고 바로 다시 센다', async () => {
    useNotificationStore.setState({ isLive: true });
    show();
    await waitFor(() => expect(fetchUnreadMessageCount).toHaveBeenCalledTimes(1));

    fetchUnreadMessageCount.mockResolvedValue(3);
    act(() => {
      useNotificationStore.setState(prev => ({
        arrivals: { ...prev.arrivals, MESSAGE: (prev.arrivals.MESSAGE ?? 0) + 1 },
      }));
    });

    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});
