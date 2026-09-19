// client/src/components/Dashboard/NotificationBell.test.tsx
//
// 알림 목록을 키보드로도 쓸 수 있는가.
// 목록은 body 끝으로 포털되어 벨에서 Tab 을 눌러도 닿지 않고, 행은 클릭만 받아서
// 키보드 사용자는 알림을 열 수도, 닫을 수도 없었다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { useUIOverlays } from '../../store/uiOverlays';
import { useNotificationStore } from '../../store/notifications';

// framer-motion 의 애니메이션은 happy-dom 에서 취소될 때 잡히지 않는 AbortError 를 남기고,
// vitest 는 테스트가 모두 통과해도 그 때문에 실패로 끝난다(LotteryPanel.test 와 같은 처리).
// 태그는 그대로 두고 애니메이션 속성만 걷어 낸다.
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      variants: _v,
      whileHover: _wh,
      whileTap: _wt,
      layout: _l,
      ...rest
    }: Record<string, unknown>) {
      return createElement(tag, rest);
    };
  // 태그별로 한 번만 만든다 — 매번 새 컴포넌트면 React 가 그 자리를 통째로 갈아 끼운다
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

const getNotifications = vi.hoisted(() => vi.fn());
const markAsRead = vi.hoisted(() => vi.fn());
const markAllAsRead = vi.hoisted(() => vi.fn());
const deleteNotification = vi.hoisted(() => vi.fn());
vi.mock('../../api/notifications', () => ({
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications: vi.fn(),
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('../../utils/toast', () => ({
  toast: { error: toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

beforeEach(() => {
  vi.clearAllMocks();
  // 열림 상태는 전역 스토어에 있다 — 앞 테스트가 열어 둔 채면 벨을 눌러 오히려 닫게 된다
  useUIOverlays.setState({ activeDropdown: null });
  // 알림 스토어가 SSE 로 붙으려 하지 않게 한다 — 여기서 보려는 것은 벨의 키보드 동작이다
  vi.stubGlobal('EventSource', undefined);
  getNotifications.mockResolvedValue({
    notifications: [
      {
        id: 1,
        type: 'DUEL',
        message: '김철수님이 대결을 신청했습니다.',
        link: '/profile?tab=points&duel=7',
        relatedId: '7',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ],
    unreadCount: 1,
    nextCursor: null,
  });
  markAsRead.mockResolvedValue({ unreadCount: 0 });
  markAllAsRead.mockResolvedValue({ unreadCount: 0 });
  deleteNotification.mockResolvedValue({ unreadCount: 0 });
  useNotificationStore.setState({ unreadCount: 0, readIds: new Set<number>() });
});
afterEach(() => vi.unstubAllGlobals());

// 목록 안에도 '알림' 으로 시작하는 단추가 있다 — 벨의 이름만 정확히 잡는다
const bell = () => screen.getByRole('button', { name: /^알림( \d+개 미읽음)?$/ });
const open = async () => {
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  );
  fireEvent.click(bell());
  return screen.findByRole('button', { name: /대결을 신청했습니다/ });
};

describe('알림 목록 — 키보드', () => {
  it('벨이 열림 상태를 알린다', async () => {
    await open();
    expect(bell()).toHaveAttribute('aria-expanded', 'true');
  });

  it('열리면 포커스가 목록으로 간다 — 포털이라 Tab 으로는 닿지 않는다', async () => {
    await open();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('dialog', { name: '알림 목록' }))
    );
  });

  it('Enter 로 알림을 연다', async () => {
    const row = await open();
    fireEvent.keyDown(row, { key: 'Enter' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/profile?tab=points&duel=7'));
    expect(markAsRead).toHaveBeenCalledWith(1);
  });

  it('Esc 로 닫고 포커스를 벨로 되돌린다', async () => {
    await open();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(bell()).toHaveAttribute('aria-expanded', 'false'));
    expect(document.activeElement).toBe(bell());
  });
});

describe('알림 목록 — 거르기·묶기·새로 온 것', () => {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const item = (id: number, isRead: boolean, createdAt: string, message: string) => ({
    id,
    type: 'COMMENT',
    message,
    link: null,
    relatedId: null,
    isRead,
    createdAt,
  });

  const renderOpen = async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(bell());
    await screen.findByRole('dialog', { name: '알림 목록' });
  };

  it('안 읽음만 골라 본다', async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(2, false, at(0), '안 읽은 댓글'), item(1, true, at(0), '읽은 댓글')],
      unreadCount: 1,
      nextCursor: null,
    });
    await renderOpen();
    expect(await screen.findByText('읽은 댓글')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /안 읽음/ }));
    expect(screen.getByText('안 읽은 댓글')).toBeInTheDocument();
    expect(screen.queryByText('읽은 댓글')).not.toBeInTheDocument();
  });

  it('오늘 · 이전 으로 묶어 보여 준다', async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(2, false, at(0), '방금 것'), item(1, true, at(24 * 5), '오래된 것')],
      unreadCount: 1,
      nextCursor: null,
    });
    await renderOpen();
    await screen.findByText('방금 것');
    expect(screen.getByText('오늘')).toBeInTheDocument();
    expect(screen.getByText('이전')).toBeInTheDocument();
  });

  it('열어 둔 동안 새 알림이 오면 닫지 않아도 맨 위에 붙는다', async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(1, false, at(0), '처음 것')],
      unreadCount: 1,
      nextCursor: null,
    });
    await renderOpen();
    await screen.findByText('처음 것');

    getNotifications.mockResolvedValue({
      notifications: [item(2, false, at(0), '새로 온 것'), item(1, false, at(0), '처음 것')],
      unreadCount: 2,
      nextCursor: null,
    });
    act(() => {
      useNotificationStore.setState(s => ({
        arrivals: { ...s.arrivals, COMMENT: (s.arrivals.COMMENT ?? 0) + 1 },
      }));
    });

    expect(await screen.findByText('새로 온 것')).toBeInTheDocument();
    const rows = screen.getAllByRole('button', { name: /것/ });
    expect(rows[0]).toHaveTextContent('새로 온 것');
    expect(screen.getAllByText('처음 것')).toHaveLength(1);
  });
});

describe('종 숫자와 목록이 어긋나지 않는다', () => {
  const item = (id: number, isRead = false) => ({
    id,
    type: 'COMMENT',
    message: `알림 ${id}`,
    link: null,
    relatedId: null,
    isRead,
    createdAt: new Date().toISOString(),
  });

  const openBell = async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(bell());
    await screen.findByRole('dialog', { name: '알림 목록' });
  };

  it('팝업에서 읽은 알림을 목록에서 또 눌러도 숫자가 더 줄지 않는다', async () => {
    // 팝업과 목록은 같은 알림을 따로 들고 있다. 각자 하나씩 깎으면 실제보다 적게 남았다.
    // 이제 둘 다 서버가 센 수를 그대로 쓴다 — 두 번 눌러도 서버가 말한 값 그대로다.
    getNotifications.mockResolvedValue({
      notifications: [item(7)],
      unreadCount: 3,
      nextCursor: null,
    });
    markAsRead.mockResolvedValue({ unreadCount: 2 });
    await openBell();
    act(() => useNotificationStore.setState({ unreadCount: 3 }));

    // 팝업이 먼저 읽었다(서버가 센 값 2 를 받았다)
    act(() => useNotificationStore.getState().markRead(7, 2));
    expect(useNotificationStore.getState().unreadCount).toBe(2);

    // 목록에서 같은 줄을 누른다 — 서버는 여전히 2 라고 한다
    fireEvent.click(await screen.findByRole('button', { name: /알림 7/ }));
    await waitFor(() => expect(markAsRead).toHaveBeenCalledWith(7));
    await waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(2));
  });

  it('팝업에서 읽으면 목록에서도 읽은 것으로 보인다', async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(7)],
      unreadCount: 1,
      nextCursor: null,
    });
    await openBell();
    fireEvent.click(screen.getByRole('button', { name: /안 읽음/ }));
    expect(await screen.findByText('알림 7')).toBeInTheDocument();

    act(() => useNotificationStore.getState().markRead(7));

    // '안 읽음' 으로 거른 목록에서 빠진다
    await waitFor(() => expect(screen.queryByText('알림 7')).not.toBeInTheDocument());
  });

  it('읽는 중에 도착한 조회 결과가 방금 지운 알림을 되살리지 않는다', async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(99), item(98)],
      unreadCount: 2,
      nextCursor: null,
    });
    await openBell();
    await screen.findByText('알림 99');

    // 새 알림이 와서 첫 페이지를 다시 받는 중 — 아직 서버는 99 를 들고 있다
    let resolveArrival: (v: unknown) => void = () => {};
    getNotifications.mockReturnValue(
      new Promise(res => {
        resolveArrival = res;
      })
    );
    act(() => {
      useNotificationStore.setState(s => ({
        arrivals: { ...s.arrivals, COMMENT: (s.arrivals.COMMENT ?? 0) + 1 },
      }));
    });

    // 그 사이 사용자가 99 를 지운다
    fireEvent.click(screen.getAllByRole('button', { name: '알림 삭제' })[0]);
    await waitFor(() => expect(screen.queryByText('알림 99')).not.toBeInTheDocument());

    // 늦게 도착한 조회 결과에는 아직 99 가 들어 있다
    await act(async () => {
      resolveArrival({
        notifications: [item(100), item(99), item(98)],
        unreadCount: 3,
        nextCursor: null,
      });
    });

    expect(screen.queryByText('알림 99')).not.toBeInTheDocument();
  });

  it('불러오는 중에 모두 읽음을 눌러도 다시 안 읽음으로 돌아가지 않는다', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    getNotifications.mockReturnValue(
      new Promise(res => {
        resolveFirst = res;
      })
    );
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    act(() => useNotificationStore.setState({ unreadCount: 2 }));
    fireEvent.click(bell());

    fireEvent.click(await screen.findByRole('button', { name: /모두 읽음/ }));
    await waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(0));

    await act(async () => {
      resolveFirst({ notifications: [item(9), item(8)], unreadCount: 2, nextCursor: null });
    });

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('삭제가 실패하면 알려 준다 — 아무 일도 없던 것처럼 두지 않는다', async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(7)],
      unreadCount: 1,
      nextCursor: null,
    });
    deleteNotification.mockRejectedValue(new Error('끊김'));
    await openBell();
    await screen.findByText('알림 7');

    fireEvent.click(screen.getByRole('button', { name: '알림 삭제' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByText('알림 7')).toBeInTheDocument();
  });
});

describe('오는 중인 요청과 겹쳐도 화면이 멈추지 않는다', () => {
  const item = (id: number, isRead = false) => ({
    id,
    type: 'COMMENT',
    message: `알림 ${id}`,
    link: null,
    relatedId: null,
    isRead,
    createdAt: new Date().toISOString(),
  });

  it('불러오는 중에 새 알림이 와도 목록이 뜬다 — 영영 도는 상태로 멈추지 않는다', async () => {
    // 오는 중인 요청을 모두 붙잡아 둔다 — 스토어의 첫 폴링이 목록 조회를 먼저 집어가므로
    // 하나만 붙잡으면 정작 패널의 조회는 곧바로 끝나 이 상황이 재현되지 않는다.
    const pending: Array<(v: unknown) => void> = [];
    getNotifications.mockImplementation(
      () =>
        new Promise(res => {
          pending.push(res);
        })
    );
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(bell());
    await screen.findByRole('dialog', { name: '알림 목록' });
    // 패널은 아직 '불러오는 중'
    expect(screen.queryByText('알림 100')).not.toBeInTheDocument();

    // 첫 장이 아직 오는 중인데 새 알림이 도착한다(세대가 올라간다)
    act(() => {
      useNotificationStore.setState(s => ({
        arrivals: { ...s.arrivals, COMMENT: (s.arrivals.COMMENT ?? 0) + 1 },
      }));
    });
    // 붙잡아 둔 요청들을 모두 풀어 준다(패널의 첫 조회 + 새 알림 때문에 나간 조회)
    await act(async () => {
      for (const res of pending) {
        res({ notifications: [item(101), item(100)], unreadCount: 2, nextCursor: null });
      }
    });

    expect(await screen.findByText('알림 101')).toBeInTheDocument();
  });

  it("'더 보기' 중에 하나를 지워도 다시 누를 수 있다", async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(10), item(9)],
      unreadCount: 2,
      nextCursor: 8,
    });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(bell());
    const more = await screen.findByRole('button', { name: '더 보기' });

    let resolvePage: (v: unknown) => void = () => {};
    getNotifications.mockReturnValueOnce(
      new Promise(res => {
        resolvePage = res;
      })
    );
    fireEvent.click(more);
    fireEvent.click(screen.getAllByRole('button', { name: '알림 삭제' })[0]);
    await act(async () => {
      resolvePage({ notifications: [item(8)], unreadCount: 2, nextCursor: null });
    });

    // '로드 중...' 인 채로 굳지 않는다
    expect(screen.queryByRole('button', { name: '로드 중...' })).not.toBeInTheDocument();
  });

  it('읽으면 서버가 센 수를 그대로 쓴다 — 밀어 준 수에 또 깎지 않는다', async () => {
    getNotifications.mockResolvedValue({
      notifications: [item(7)],
      unreadCount: 3,
      nextCursor: null,
    });
    markAsRead.mockResolvedValue({ unreadCount: 2 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    fireEvent.click(bell());
    await screen.findByRole('dialog', { name: '알림 목록' });
    act(() => useNotificationStore.setState({ unreadCount: 2 })); // 스트림이 먼저 알려 준 값

    fireEvent.click(await screen.findByRole('button', { name: /알림 7/ }));

    await waitFor(() => expect(markAsRead).toHaveBeenCalledWith(7));
    await waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(2));
  });
});
