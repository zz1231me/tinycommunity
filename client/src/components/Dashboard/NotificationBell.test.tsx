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
vi.mock('../../api/notifications', () => ({
  getNotifications,
  markAsRead,
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  deleteAllNotifications: vi.fn(),
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
  markAsRead.mockResolvedValue({});
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
