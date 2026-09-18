// client/src/store/notifications.test.ts
// SSE + 폴링 폴백이 섞인 스토어라 상태 전이가 까다롭다.
// 특히 "잘못된 프레임이 와도 리스너가 터지지 않는다"를 고정한다 — EventSource 리스너의
// 예외는 아무도 잡지 않아 이후 이벤트 처리가 조용히 멈춘다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetNotifications = vi.fn();
vi.mock('../api/notifications', () => ({
  getNotifications: () => mockGetNotifications(),
}));

/** 등록된 리스너를 테스트에서 직접 발화시킬 수 있는 최소 EventSource 대역 */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, Array<(e: Event) => void>>();
  closed = false;

  constructor(public url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, fn: (e: Event) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: unknown) {
    const evt = { data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(evt as unknown as Event);
  }
}

vi.stubGlobal('EventSource', FakeEventSource);

// 스토어는 모듈 로드 시 생성되므로 mock 설정 뒤에 import 한다
const { useNotificationStore } = await import('./notifications');

const reset = () =>
  useNotificationStore.setState({
    unreadCount: 0,
    toast: null,
    lastSeenId: null,
    isLive: false,
    arrivals: {},
    _timer: null,
    _source: null,
    _subscribers: 0,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 0 });
  FakeEventSource.last = null;
  reset();
});

describe('SSE 연결', () => {
  it('start 하면 스트림에 연결하고 open 시 isLive 가 켜진다', () => {
    useNotificationStore.getState().start();

    expect(FakeEventSource.last?.url).toBe('/api/notifications/stream');
    expect(useNotificationStore.getState().isLive).toBe(false);

    FakeEventSource.last!.emit('open');
    expect(useNotificationStore.getState().isLive).toBe(true);
  });

  it('unread-count 이벤트로 뱃지를 맞춘다', () => {
    useNotificationStore.getState().start();
    FakeEventSource.last!.emit('unread-count', { count: 7 });

    expect(useNotificationStore.getState().unreadCount).toBe(7);
  });

  it('음수 count 는 0 으로 보정한다', () => {
    useNotificationStore.getState().start();
    FakeEventSource.last!.emit('unread-count', { count: -3 });

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('notification 이벤트는 뱃지를 올리고, 기준선이 있으면 토스트를 띄운다', () => {
    useNotificationStore.getState().start();
    useNotificationStore.setState({ lastSeenId: 10 });

    FakeEventSource.last!.emit('notification', { id: 11, message: '새 댓글' });

    const s = useNotificationStore.getState();
    expect(s.unreadCount).toBe(1);
    expect(s.toast).toMatchObject({ id: 11 });
    expect(s.lastSeenId).toBe(11);
  });

  it('기준선이 없으면(첫 폴링 전) 토스트를 띄우지 않고 기준선만 세운다', () => {
    useNotificationStore.getState().start();
    // lastSeenId 는 null 인 상태

    FakeEventSource.last!.emit('notification', { id: 5, message: '알림' });

    const s = useNotificationStore.getState();
    expect(s.toast).toBeNull();
    expect(s.lastSeenId).toBe(5);
  });

  it('이미 본 id 보다 작은 알림은 토스트를 띄우지 않는다', () => {
    useNotificationStore.getState().start();
    useNotificationStore.setState({ lastSeenId: 20 });

    FakeEventSource.last!.emit('notification', { id: 3, message: '오래된 것' });

    expect(useNotificationStore.getState().toast).toBeNull();
    // 기준선은 뒤로 밀리지 않는다
    expect(useNotificationStore.getState().lastSeenId).toBe(20);
  });

  it('잘못된 JSON 프레임이 와도 던지지 않고 상태를 건드리지 않는다', () => {
    useNotificationStore.getState().start();
    useNotificationStore.setState({ unreadCount: 4, lastSeenId: 9 });

    expect(() => FakeEventSource.last!.emit('notification', '{잘린 JSON')).not.toThrow();
    expect(() => FakeEventSource.last!.emit('unread-count', '')).not.toThrow();

    const s = useNotificationStore.getState();
    expect(s.unreadCount).toBe(4);
    expect(s.lastSeenId).toBe(9);
  });

  it('error 이벤트가 오면 isLive 를 내려 폴링 주기가 짧아지게 한다', () => {
    useNotificationStore.getState().start();
    FakeEventSource.last!.emit('open');
    expect(useNotificationStore.getState().isLive).toBe(true);

    FakeEventSource.last!.emit('error');
    expect(useNotificationStore.getState().isLive).toBe(false);
  });
});

describe('구독자 참조 카운트', () => {
  it('여러 구독자가 하나의 연결을 공유한다', () => {
    useNotificationStore.getState().start();
    const first = FakeEventSource.last;
    useNotificationStore.getState().start();

    expect(FakeEventSource.last).toBe(first); // 새 연결을 만들지 않는다
    expect(useNotificationStore.getState()._subscribers).toBe(2);
  });

  it('마지막 구독자가 사라질 때만 연결을 닫는다', () => {
    useNotificationStore.getState().start();
    useNotificationStore.getState().start();
    const source = FakeEventSource.last!;

    useNotificationStore.getState().stop();
    expect(source.closed).toBe(false);

    useNotificationStore.getState().stop();
    expect(source.closed).toBe(true);
    expect(useNotificationStore.getState()._source).toBeNull();
    expect(useNotificationStore.getState()._timer).toBeNull();
  });
});

describe('폴링 폴백 주기', () => {
  it('SSE 가 끊긴 상태에서는 30초마다 폴링한다', async () => {
    useNotificationStore.getState().start();
    mockGetNotifications.mockClear(); // start 시 즉시 1회 호출분 제외

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockGetNotifications).toHaveBeenCalledTimes(2);
  });

  it('SSE 가 연결되면 폴링 주기가 5분으로 늘어난다', async () => {
    useNotificationStore.getState().start();
    FakeEventSource.last!.emit('open');
    mockGetNotifications.mockClear();

    await vi.advanceTimersByTimeAsync(30_000 * 4); // 2분
    expect(mockGetNotifications).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000 * 6); // 누적 5분
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);
  });
});

describe('도착 신호 (arrivals)', () => {
  // 알림이 오면 관련 화면이 스스로 다시 읽는 데 쓰는 신호다(useNotificationArrival).
  // SSE 와 폴링 어느 쪽으로 오든 남아야 한다.
  it('SSE 로 온 알림을 그 종류의 도착으로 센다', () => {
    useNotificationStore.getState().start();
    FakeEventSource.last!.emit('notification', { id: 11, type: 'ATTACK', message: '공격' });
    expect(useNotificationStore.getState().arrivals.ATTACK).toBe(1);
  });

  it('폴링으로 새로 알게 된 알림도 센다 — 이미 읽은 알림이어도', async () => {
    // 읽은 알림은 토스트를 띄우지 않는다. 토스트를 신호로 썼다면 여기서 신호가 빠진다.
    useNotificationStore.setState({ lastSeenId: 10 });
    mockGetNotifications.mockResolvedValue({
      notifications: [{ id: 12, type: 'DUEL', message: '도전장', isRead: true }],
      unreadCount: 0,
    });
    await useNotificationStore.getState().poll();

    const s = useNotificationStore.getState();
    expect(s.toast).toBeNull();
    expect(s.arrivals.DUEL).toBe(1);
  });

  it('한 번의 폴링에 여러 개가 오면 종류마다 모두 센다', async () => {
    // SSE 가 끊겨 30초 폴링으로 받을 때다. 가장 최근 것(댓글)만 보면 도전장이 묻힌다.
    useNotificationStore.setState({ lastSeenId: 10 });
    mockGetNotifications.mockResolvedValue({
      notifications: [
        { id: 13, type: 'COMMENT', message: '댓글', isRead: false },
        { id: 12, type: 'DUEL', message: '도전장', isRead: false },
        { id: 11, type: 'ATTACK', message: '공격', isRead: false },
      ],
      unreadCount: 3,
    });
    await useNotificationStore.getState().poll();

    const { arrivals } = useNotificationStore.getState();
    expect(arrivals).toEqual({ COMMENT: 1, DUEL: 1, ATTACK: 1 });
  });

  it('이미 본 알림은 새로 도착한 것으로 치지 않는다 — 음성 대조', async () => {
    useNotificationStore.setState({ lastSeenId: 20 });
    mockGetNotifications.mockResolvedValue({
      notifications: [{ id: 20, type: 'DUEL', message: '예전 것', isRead: false }],
      unreadCount: 1,
    });
    await useNotificationStore.getState().poll();
    expect(useNotificationStore.getState().arrivals).toEqual({});
  });
});
