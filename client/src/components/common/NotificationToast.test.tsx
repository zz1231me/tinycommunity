// client/src/components/common/NotificationToast.test.tsx
// 새 알림 팝업 — 무엇이 왔는지 알 수 있고, 눌러서 그리로 가고, 읽는 동안에는 사라지지 않는가.

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Notification } from '../../api/notifications';

// framer-motion 은 happy-dom 에서 잡히지 않는 AbortError 를 남긴다(NotificationBell.test 와 같은 처리)
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...rest
    }: Record<string, unknown>) {
      return createElement(tag, rest);
    };
  const cache = new Map<string, ReturnType<typeof strip>>();
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) => {
          if (!cache.has(tag)) cache.set(tag, strip(tag));
          return cache.get(tag);
        },
      }
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
  };
});

const mockMarkAsRead = vi.fn();
vi.mock('../../api/notifications', () => ({
  markAsRead: (id: number) => mockMarkAsRead(id),
  getNotifications: vi.fn(),
}));

// 스토어의 연결(start/stop)은 이 테스트의 관심이 아니다
vi.mock('../../hooks/useRealtimeNotifications', async () => {
  const { useNotificationStore } = await import('../../store/notifications');
  return {
    useRealtimeNotifications: () => ({
      newNotification: useNotificationStore(s => s.toast),
      clearNew: useNotificationStore(s => s.clearToast),
    }),
  };
});

const { useNotificationStore } = await import('../../store/notifications');
const { NotificationToast, TOAST_MS, URGENT_TOAST_MS } = await import('./NotificationToast');

const note = (over: Partial<Notification> = {}): Notification => ({
  id: 1,
  type: 'COMMENT',
  message: '앨리스님이 댓글을 남겼습니다',
  link: '/posts/7',
  relatedId: null,
  isRead: false,
  createdAt: new Date().toISOString(),
  ...over,
});

function show(n: Notification, more = 0) {
  act(() => useNotificationStore.setState({ toast: n, toastMore: more, unreadCount: 3 }));
}

function renderToast() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <NotificationToast />
      <Routes>
        <Route path="/" element={<p>홈</p>} />
        <Route path="/posts/7" element={<p>글 7</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const card = () => screen.queryByTestId('notification-toast');

beforeEach(() => {
  vi.useFakeTimers();
  mockMarkAsRead.mockResolvedValue({});
  useNotificationStore.setState({ toast: null, toastMore: 0, unreadCount: 0 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('무엇이 왔는지 보인다', () => {
  it('종류마다 제목이 다르다 — 모두 "새 알림" 이 아니다', () => {
    renderToast();
    show(note({ type: 'ATTACK', message: '바비님이 퇴근 공격!' }));
    expect(screen.getByText('퇴근 공격!')).toBeInTheDocument();
    expect(screen.getByText('바비님이 퇴근 공격!')).toBeInTheDocument();
    expect(screen.queryByText('새 알림')).not.toBeInTheDocument();
  });

  it('그사이 함께 온 알림 수를 보여 준다', () => {
    renderToast();
    show(note(), 2);
    expect(screen.getByText('외 2건')).toBeInTheDocument();
  });

  it('하나뿐이면 수를 달지 않는다 — 대조', () => {
    renderToast();
    show(note(), 0);
    expect(screen.queryByText(/외 \d+건/)).not.toBeInTheDocument();
  });

  it('화면 낭독기가 읽어 주는 영역 안에 뜬다', () => {
    renderToast();
    show(note());
    expect(screen.getByRole('status')).toContainElement(card());
  });
});

describe('누르면 그리로 간다', () => {
  it('읽음으로 하고, 알림의 자리로 가고, 팝업을 닫는다', async () => {
    renderToast();
    show(note());
    fireEvent.click(screen.getByRole('button', { name: /새 댓글/ }));

    expect(screen.getByText('글 7')).toBeInTheDocument();
    expect(mockMarkAsRead).toHaveBeenCalledWith(1);
    expect(card()).toBeNull();
    await act(async () => {});
    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });

  it('읽음 처리가 실패하면 종 숫자를 줄이지 않는다', async () => {
    mockMarkAsRead.mockRejectedValue(new Error('끊김'));
    renderToast();
    show(note());
    fireEvent.click(screen.getByRole('button', { name: /새 댓글/ }));
    await act(async () => {});
    expect(useNotificationStore.getState().unreadCount).toBe(3);
  });

  it('닫기는 이동하지 않고 닫기만 한다', () => {
    renderToast();
    show(note());
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(card()).toBeNull();
    expect(screen.getByText('홈')).toBeInTheDocument();
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });
});

describe('사라지는 때', () => {
  it('보통 알림은 잠시 뒤 사라진다', () => {
    renderToast();
    show(note());
    act(() => vi.advanceTimersByTime(TOAST_MS - 100));
    expect(card()).not.toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(card()).toBeNull();
  });

  it('공격·대결은 더 오래 남는다', () => {
    renderToast();
    show(note({ type: 'ATTACK' }));
    act(() => vi.advanceTimersByTime(TOAST_MS + 100));
    expect(card()).not.toBeNull();
    act(() => vi.advanceTimersByTime(URGENT_TOAST_MS - TOAST_MS));
    expect(card()).toBeNull();
  });

  it('마우스를 올려 둔 동안에는 사라지지 않고, 떼면 남은 시간만큼만 더 있다', () => {
    renderToast();
    show(note());
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.mouseEnter(card()!);
    act(() => vi.advanceTimersByTime(60_000));
    expect(card()).not.toBeNull();

    fireEvent.mouseLeave(card()!);
    act(() => vi.advanceTimersByTime(TOAST_MS - 4000 - 100));
    expect(card()).not.toBeNull();
    act(() => vi.advanceTimersByTime(200));
    expect(card()).toBeNull();
  });

  it('키보드로 들어와 있는 동안에도 멈춘다', () => {
    renderToast();
    show(note());
    fireEvent.focus(screen.getByRole('button', { name: '알림 닫기' }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(card()).not.toBeNull();
  });

  it('새 알림이 오면 남은 시간을 처음부터 센다', () => {
    renderToast();
    show(note({ id: 1 }));
    act(() => vi.advanceTimersByTime(TOAST_MS - 1000));
    show(note({ id: 2, message: '두 번째' }));
    act(() => vi.advanceTimersByTime(TOAST_MS - 100));
    expect(screen.getByText('두 번째')).toBeInTheDocument();
  });
});
