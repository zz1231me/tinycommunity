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
  static readonly CLOSED = 2;
  listeners = new Map<string, Array<(e: Event) => void>>();
  closed = false;
  /** 0 CONNECTING · 1 OPEN · 2 CLOSED — 브라우저가 스스로 다시 잇는지 가른다 */
  readyState = 1;

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

const reset = () => {
  // 앞 테스트가 걸어 둔 타이머·연결·화면 손잡이를 먼저 걷는다.
  // 스토어 모듈은 파일 전체가 함께 쓰므로, 남겨 두면 뒤 테스트에서 엉뚱하게 같이 돈다
  // (실제로 visibilitychange 손잡이가 스물 몇 개까지 쌓여 폴링이 그만큼 돌았다).
  const prev = useNotificationStore.getState();
  if (prev._timer) clearInterval(prev._timer);
  if (prev._onVisible) document.removeEventListener('visibilitychange', prev._onVisible);
  prev._source?.close();
  useNotificationStore.setState({
    unreadCount: 0,
    toast: null,
    toastMore: 0,
    readIds: new Set<number>(),
    lastSeenId: null,
    isLive: false,
    arrivals: {},
    _timer: null,
    _retry: 0,
    _standDown: false,
    _localChangeAt: 0,
    _source: null,
    _onVisible: null,
    _subscribers: 0,
  });
};

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

describe('팝업에 묻힌 알림 수 (외 N건)', () => {
  it('팝업이 떠 있는 동안 또 오면 앞의 것을 센다', () => {
    useNotificationStore.getState().start();
    useNotificationStore.setState({ lastSeenId: 10 });

    FakeEventSource.last!.emit('notification', { id: 11, message: '하나' });
    expect(useNotificationStore.getState().toastMore).toBe(0);
    FakeEventSource.last!.emit('notification', { id: 12, message: '둘' });
    FakeEventSource.last!.emit('notification', { id: 13, message: '셋' });

    const s = useNotificationStore.getState();
    expect(s.toast).toMatchObject({ id: 13 });
    expect(s.toastMore).toBe(2);
  });

  it('팝업을 닫은 뒤에 온 것은 새로 센다 — 대조', () => {
    useNotificationStore.getState().start();
    useNotificationStore.setState({ lastSeenId: 10 });

    FakeEventSource.last!.emit('notification', { id: 11, message: '하나' });
    useNotificationStore.getState().clearToast();
    FakeEventSource.last!.emit('notification', { id: 12, message: '둘' });

    expect(useNotificationStore.getState().toastMore).toBe(0);
  });

  it('폴링으로 한 번에 여럿이 오면 안 읽은 것만 센다', async () => {
    useNotificationStore.setState({ lastSeenId: 10 });
    mockGetNotifications.mockResolvedValue({
      notifications: [
        { id: 14, isRead: false, message: 'd', type: 'COMMENT' },
        { id: 13, isRead: true, message: 'c', type: 'COMMENT' },
        { id: 12, isRead: false, message: 'b', type: 'COMMENT' },
        { id: 11, isRead: false, message: 'a', type: 'COMMENT' },
        { id: 10, isRead: false, message: 'old', type: 'COMMENT' },
      ],
      unreadCount: 4,
    });

    await useNotificationStore.getState().poll();

    const s = useNotificationStore.getState();
    expect(s.toast).toMatchObject({ id: 14 });
    expect(s.toastMore).toBe(2);
  });
});

describe('읽음 처리는 한 번만 센다', () => {
  // 팝업과 종 목록이 같은 알림을 따로 들고 있다. 서버 읽음 처리는 두 번 다 성공하므로,
  // 각자 뱃지를 줄이면 실제보다 적게 남았다.
  it('같은 알림을 두 곳에서 읽어도 뱃지는 한 번만 줄어든다', () => {
    useNotificationStore.setState({ unreadCount: 5 });

    useNotificationStore.getState().markRead(100); // 팝업에서
    useNotificationStore.getState().markRead(100); // 종 목록에서 같은 것을

    expect(useNotificationStore.getState().unreadCount).toBe(4);
    expect(useNotificationStore.getState().readIds.has(100)).toBe(true);
  });

  it('다른 알림은 각각 줄인다 — 대조', () => {
    useNotificationStore.setState({ unreadCount: 5 });

    useNotificationStore.getState().markRead(100);
    useNotificationStore.getState().markRead(101);

    expect(useNotificationStore.getState().unreadCount).toBe(3);
  });

  it('0 아래로는 내려가지 않는다', () => {
    useNotificationStore.setState({ unreadCount: 0 });
    useNotificationStore.getState().markRead(1);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});

describe('스트림이 완전히 닫혔을 때', () => {
  it('다시 잇는다 — 닫힌 채로 두면 새로고침 전까지 폴링만 돈다', () => {
    useNotificationStore.getState().start();
    const first = FakeEventSource.last!;
    first.readyState = 2; // CLOSED — 502·401 처럼 브라우저가 스스로 잇지 않는 경우

    first.emit('error');
    expect(useNotificationStore.getState().isLive).toBe(false);
    expect(first.closed).toBe(true);

    vi.advanceTimersByTime(2100);
    expect(FakeEventSource.last).not.toBe(first);
    expect(useNotificationStore.getState()._source).not.toBeNull();
  });

  it('잠깐 끊긴 것(스스로 다시 이음)은 건드리지 않는다 — 대조', () => {
    useNotificationStore.getState().start();
    const first = FakeEventSource.last!;
    first.readyState = 0; // CONNECTING — EventSource 가 스스로 잇는 중

    first.emit('error');

    expect(first.closed).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(FakeEventSource.last).toBe(first);
  });

  it('보는 사람이 없으면(로그아웃) 다시 잇지 않는다', () => {
    useNotificationStore.getState().start();
    const first = FakeEventSource.last!;
    useNotificationStore.getState().stop(); // 구독자 0
    first.readyState = 2;

    first.emit('error');
    vi.advanceTimersByTime(60_000);

    expect(FakeEventSource.last).toBe(first);
  });
});

describe('스트림이 이어지면', () => {
  it('한 번 훑는다 — 끊긴 동안 온 알림은 스트림으로 오지 않는다', async () => {
    useNotificationStore.setState({ lastSeenId: 10 });
    useNotificationStore.getState().start();
    mockGetNotifications.mockClear();

    FakeEventSource.last!.emit('open');
    await vi.waitFor(() => expect(mockGetNotifications).toHaveBeenCalled());
  });
});

describe('숨은 탭에서 시작해도', () => {
  it('기준선은 세운다 — 세우지 않으면 첫 알림이 팝업 없이 지나간다', async () => {
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      mockGetNotifications.mockResolvedValue({
        notifications: [{ id: 7, isRead: false, message: 'a', type: 'COMMENT' }],
        unreadCount: 1,
      });

      await useNotificationStore.getState().poll();
      expect(useNotificationStore.getState().lastSeenId).toBe(7);

      // 기준선이 있으면 숨은 탭에서는 더 묻지 않는다 — 대조
      mockGetNotifications.mockClear();
      await useNotificationStore.getState().poll();
      expect(mockGetNotifications).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('이상한 프레임', () => {
  it('id 가 숫자가 아니면 버린다 — 기준선이 NaN 이 되면 팝업이 영영 안 뜬다', () => {
    useNotificationStore.getState().start();
    useNotificationStore.setState({ lastSeenId: 10 });

    FakeEventSource.last!.emit('notification', { message: 'id 없음' });
    expect(useNotificationStore.getState().lastSeenId).toBe(10);

    FakeEventSource.last!.emit('notification', { id: 11, message: '정상' });
    expect(useNotificationStore.getState().lastSeenId).toBe(11);
    expect(useNotificationStore.getState().toast).toMatchObject({ id: 11 });
  });
});

describe('한 주기에 스무 개가 넘게 쌓였을 때', () => {
  /** id 가 from 부터 내림차순인 한 페이지 */
  const page = (from: number, count: number, nextCursor: number | null) => ({
    notifications: Array.from({ length: count }, (_, i) => ({
      id: from - i,
      isRead: false,
      message: `알림 ${from - i}`,
      type: 'COMMENT',
    })),
    unreadCount: 100,
    nextCursor,
  });

  it('첫 장이 전부 새것이면 기준선에 닿을 때까지 이어 받는다', async () => {
    // 스무 개만 보던 때는 스물한 번째부터가 통째로 묻혔다 — 팝업도 화면 갱신 신호도 없이.
    useNotificationStore.setState({ lastSeenId: 50 });
    mockGetNotifications
      .mockResolvedValueOnce(page(80, 20, 61)) // 80~61 전부 새것
      .mockResolvedValueOnce(page(60, 20, 41)); // 60~51 새것, 50 부터는 이미 본 것

    await useNotificationStore.getState().poll();

    const s = useNotificationStore.getState();
    expect(mockGetNotifications).toHaveBeenCalledTimes(2);
    expect(s.arrivals.COMMENT).toBe(30); // 80~51
    expect(s.toastMore).toBe(29); // 팝업 하나 말고 나머지
    expect(s.lastSeenId).toBe(80);
  });

  it('첫 장에서 기준선에 닿으면 더 묻지 않는다 — 대조', async () => {
    useNotificationStore.setState({ lastSeenId: 70 });
    mockGetNotifications.mockResolvedValue(page(75, 20, 55)); // 75~70 중 새것은 다섯

    await useNotificationStore.getState().poll();

    expect(mockGetNotifications).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().arrivals.COMMENT).toBe(5);
  });

  it('아주 오래 비웠어도 다섯 장에서 멈춘다 — 수백 개를 한꺼번에 받지 않는다', async () => {
    useNotificationStore.setState({ lastSeenId: 0 });
    mockGetNotifications.mockImplementation((cursor?: number) =>
      Promise.resolve(page(cursor ? cursor : 1000, 20, (cursor ?? 1000) - 20))
    );

    await useNotificationStore.getState().poll();

    expect(mockGetNotifications).toHaveBeenCalledTimes(5);
  });
});

describe('탭을 많이 열었을 때 (연결 자리 다툼)', () => {
  it("서버가 'bye' 로 접으면 다시 잇지 않는다 — 서로 밀어내는 돌림이 생기지 않는다", () => {
    useNotificationStore.getState().start();
    const source = FakeEventSource.last!;

    source.emit('bye', { reason: 'too-many-connections' });

    expect(source.closed).toBe(true);
    expect(useNotificationStore.getState().isLive).toBe(false);
    // 곧바로 다시 잇지 않는다 — 몇 초 만에 다시 이으면 다음 탭을 밀어내는 돌림이 시작된다.
    // (보고 있는 탭이라면 폴링 주기마다 한 번씩만 자리를 다시 잡아 본다 — 아래 따로 본다.)
    vi.advanceTimersByTime(20_000);
    expect(FakeEventSource.last).toBe(source);
  });

  it('그 탭이 화면에 나오면 자리를 다시 잡는다 — 보고 있는 탭이 실시간을 갖는다', () => {
    useNotificationStore.getState().start();
    const source = FakeEventSource.last!;
    source.emit('bye', {});

    document.dispatchEvent(new Event('visibilitychange'));

    expect(FakeEventSource.last).not.toBe(source);
    expect(useNotificationStore.getState()._source).not.toBeNull();
  });

  it('물러난 적이 없으면 화면에 나와도 연결을 새로 만들지 않는다 — 대조', () => {
    useNotificationStore.getState().start();
    const source = FakeEventSource.last!;

    document.dispatchEvent(new Event('visibilitychange'));

    expect(FakeEventSource.last).toBe(source);
  });

  it('그만 볼 때(로그아웃) 화면 손잡이를 뗀다 — 떼지 않으면 로그아웃 뒤에도 서버에 묻는다', () => {
    useNotificationStore.getState().start();
    const source = FakeEventSource.last!;
    source.emit('bye', {});
    useNotificationStore.getState().stop();
    mockGetNotifications.mockClear();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockGetNotifications).not.toHaveBeenCalled();
    expect(FakeEventSource.last).toBe(source);
  });
});

describe('서버가 센 수를 그대로 쓴다', () => {
  // 스트림이 밀어 준 수를 이미 반영한 뒤에 화면이 또 하나를 깎으면 뱃지가 실제보다 적어진다.
  it('읽음 응답의 수를 받으면 그 값으로 맞춘다 — 또 깎지 않는다', () => {
    useNotificationStore.getState().start();
    useNotificationStore.setState({ unreadCount: 3 });

    FakeEventSource.last!.emit('unread-count', { count: 2 }); // 서버가 먼저 밀어 준다
    useNotificationStore.getState().markRead(100, 2); // 응답도 2 라고 한다

    expect(useNotificationStore.getState().unreadCount).toBe(2);
    expect(useNotificationStore.getState().readIds.has(100)).toBe(true);
  });

  it('서버 수가 없으면(오래된 응답·폴링만 도는 중) 하나 깎는다 — 대조', () => {
    useNotificationStore.setState({ unreadCount: 3 });
    useNotificationStore.getState().markRead(100);
    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });
});

describe('이어 받는 사이에 스트림이 앞서갔을 때', () => {
  it('기준선을 뒤로 물리지 않는다 — 물리면 같은 알림에 팝업이 두 번 뜬다', async () => {
    useNotificationStore.setState({ lastSeenId: 50 });
    useNotificationStore.getState().start();
    const page = (from: number, count: number, nextCursor: number | null) => ({
      notifications: Array.from({ length: count }, (_, i) => ({
        id: from - i,
        isRead: false,
        message: `알림 ${from - i}`,
        type: 'COMMENT',
      })),
      unreadCount: 10,
      nextCursor,
    });
    mockGetNotifications
      .mockResolvedValueOnce(page(80, 20, 61))
      .mockImplementationOnce(async () => {
        // 두 번째 장을 기다리는 사이 스트림으로 더 최근 것이 왔다
        FakeEventSource.last!.emit('notification', { id: 500, message: '최신', type: 'COMMENT' });
        return page(60, 20, 41);
      });

    await useNotificationStore.getState().poll();

    expect(useNotificationStore.getState().lastSeenId).toBe(500);
  });
});

describe('늦게 도착한 오류', () => {
  it('이미 물러난 연결의 오류는 무시한다 — 다시 잇지 않는다', () => {
    useNotificationStore.getState().start();
    const source = FakeEventSource.last!;
    source.emit('bye', {});
    expect(useNotificationStore.getState()._source).toBeNull();

    source.readyState = 2;
    source.emit('error'); // 접은 뒤에 뒤늦게 도착

    vi.advanceTimersByTime(20_000); // 오류가 부르는 되잇기(2초 뒤)가 돌지 않는다
    expect(FakeEventSource.last).toBe(source);
    expect(useNotificationStore.getState()._standDown).toBe(true);
  });
});

describe('보고 있는 탭이 물러났을 때', () => {
  it('화면 전환이 없어도 폴링 때 자리를 다시 잡아 본다', async () => {
    useNotificationStore.getState().start();
    const source = FakeEventSource.last!;
    source.emit('bye', {});

    await vi.advanceTimersByTimeAsync(30_000); // 폴링 한 바퀴

    expect(FakeEventSource.last).not.toBe(source);
  });
});

describe('뒷장 하나가 실패해도', () => {
  it('첫 장에서 안 것은 지킨다', async () => {
    useNotificationStore.setState({ lastSeenId: 50 });
    const first = {
      notifications: Array.from({ length: 20 }, (_, i) => ({
        id: 80 - i,
        isRead: false,
        message: 'a',
        type: 'COMMENT',
      })),
      unreadCount: 30,
      nextCursor: 61,
    };
    mockGetNotifications
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('두 번째 장 실패'));

    await useNotificationStore.getState().poll();

    const s = useNotificationStore.getState();
    expect(s.arrivals.COMMENT).toBe(20);
    expect(s.lastSeenId).toBe(80);
    expect(s.toast).toMatchObject({ id: 80 });
  });
});
