import { create } from 'zustand';
import { getNotifications, type Notification } from '../api/notifications';
import { logger } from '../utils/logger';

// 알림 전달 단일 소스. 이 스토어만 서버와 통신하고 SSE 를 폴링으로 보완한다.
const POLL_INTERVAL_FALLBACK = 30_000;

const PAGE_SIZE = 20;
/** 폴링 한 번에 거슬러 올라갈 최대 페이지 수(100개까지). */
const MAX_POLL_PAGES = 5;
const POLL_INTERVAL_WITH_SSE = 5 * 60_000;

/** SSE 이벤트 본문 파싱. 리스너 안에서 throw 하면 안 되므로 실패 시 null 을 돌려준다. */
function parseEvent<T>(evt: Event): T | null {
  try {
    const data = (evt as MessageEvent).data;
    if (typeof data !== 'string' || data.length === 0) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

function countArrivals(
  prev: NotificationStoreState['arrivals'],
  arrived: Notification[]
): NotificationStoreState['arrivals'] {
  const next = { ...prev };
  for (const n of arrived) next[n.type] = (next[n.type] ?? 0) + 1;
  return next;
}

interface NotificationStoreState {
  unreadCount: number;
  toast: Notification | null;
  /** 팝업에 떠 있는 것 외에 함께 온 새 알림 수('외 N건'). */
  toastMore: number;
  /** 폴링 기준선. 첫 폴링에서 기존 알림이 토스트로 쏟아지지 않게 한다. */
  lastSeenId: number | null;
  isLive: boolean;
  /** 종류별 신규 도착 수. 관련 화면이 스스로 다시 읽게 하는 신호로 쓴다. */
  arrivals: Partial<Record<Notification['type'], number>>;
  _timer: ReturnType<typeof setInterval> | null;
  /** 재연결 시도 횟수. 백오프 대기 시간 계산에 쓴다. */
  _retry: number;
  /** 서버가 연결 수 상한으로 접은 상태. 탭이 화면에 나올 때까지 폴링만 한다. */
  _standDown: boolean;
  /** 마지막 로컬 읽음·삭제 시각. 그보다 먼저 떠난 조회 응답의 숫자는 버린다. */
  _localChangeAt: number;
  _source: EventSource | null;
  _subscribers: number;
  poll: () => Promise<void>;
  _connect: () => void;
  /** visibilitychange 핸들러. stop() 에서 제거하려고 보관한다. */
  _onVisible: (() => void) | null;
  start: () => void;
  stop: () => void;
  clearToast: () => void;
  setUnreadCount: (n: number) => void;
  /** 읽음/삭제 시 뱃지 1 감소. 함수형 업데이트로 연속 호출 누락을 막는다. */
  decrementUnread: () => void;
  /** 알림 읽음 처리. 같은 id 는 뱃지를 한 번만 줄인다. */
  markRead: (id: number, serverCount?: number) => void;
  /** 이번 세션에서 읽은 알림 id. 팝업과 목록이 같은 상태를 보게 한다. */
  readIds: ReadonlySet<number>;
}

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
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

  poll: async () => {
    // 탭이 숨겨져 있으면 요청 생략. 다만 기준선이 아직 없으면 한 번은 받아 둔다.
    if (typeof document !== 'undefined' && document.hidden && get().lastSeenId !== null) return;
    const startedAt = Date.now();
    try {
      const res = await getNotifications(undefined, PAGE_SIZE);
      const list: Notification[] = res?.notifications ?? [];
      // 요청을 보낸 뒤 로컬 읽음·삭제가 있었으면 응답의 숫자는 낡았다
      if (get()._localChangeAt < startedAt) set({ unreadCount: res?.unreadCount ?? 0 });

      const latest = list[0]; // id DESC 정렬이라 [0]이 최신
      if (!latest) return;

      const { lastSeenId } = get();
      if (lastSeenId === null) {
        set({ lastSeenId: latest.id }); // 첫 폴링: 기준선만 설정(토스트 X)
        return;
      }
      if (latest.id > lastSeenId) {
        // 기준선 이후를 모두 센다. 첫 페이지가 전부 새것이면 다음 장도 이어 받는다.
        const fresh = list.filter(n => n.id > lastSeenId);
        let cursor = res?.nextCursor ?? null;
        for (
          let page = 1;
          page < MAX_POLL_PAGES && cursor !== null && fresh.length === page * PAGE_SIZE;
          page++
        ) {
          // 뒷장이 실패하면 멈추기만 하고 첫 장 결과는 유지한다
          let more;
          try {
            more = await getNotifications(cursor, PAGE_SIZE);
          } catch {
            break;
          }
          const moreList: Notification[] = more?.notifications ?? [];
          fresh.push(...moreList.filter(n => n.id > lastSeenId));
          cursor = more?.nextCursor ?? null;
          if (moreList.length < PAGE_SIZE) break;
        }
        // 이어 받는 사이 스트림으로 더 최근 것이 왔을 수 있어 기준선을 뒤로 물리지 않는다
        set(prev => ({
          lastSeenId: Math.max(prev.lastSeenId ?? 0, latest.id),
          arrivals: countArrivals(prev.arrivals, fresh),
        }));
        const unread = fresh.filter(n => !n.isRead);
        if (!latest.isRead) {
          set(prev => ({
            toast: latest,
            toastMore: unread.length - 1 + (prev.toast ? prev.toastMore + 1 : 0),
          }));
        }
      }
    } catch {
      // 폴링 실패는 무시하고 다음 주기에 재시도
    }
  },

  /** SSE 연결 생성. 이미 연결이 있으면 아무것도 하지 않는다. */
  _connect: () => {
    if (typeof EventSource === 'undefined' || get()._source) return;
    let source: EventSource;
    try {
      // EventSource 는 헤더를 못 붙이지만 HttpOnly 인증 쿠키는 자동으로 실린다.
      source = new EventSource('/api/notifications/stream', { withCredentials: true });
    } catch (err) {
      logger.error('알림 스트림 연결 실패 — 폴링으로 동작합니다', err);
      return;
    }

    source.addEventListener('open', () => {
      set({ isLive: true, _retry: 0, _standDown: false });
      // 재연결 사이에 생긴 알림은 스트림으로 오지 않으므로 한 번 훑는다
      void get().poll();
    });

    // 서버가 연결 수 상한으로 접은 경우. 바로 다시 이으면 탭끼리 서로 밀어내므로 폴링으로 지낸다.
    source.addEventListener('bye', () => {
      source.close();
      set({ _source: null, isLive: false, _standDown: true });
    });

    source.addEventListener('unread-count', evt => {
      const payload = parseEvent<{ count: number }>(evt);
      if (!payload || typeof payload.count !== 'number') return;
      set({ unreadCount: Math.max(0, payload.count) });
    });

    source.addEventListener('notification', evt => {
      const n = parseEvent<Notification>(evt);
      // id 가 숫자가 아니면 버린다. NaN 이 기준선에 들어가면 이후 비교가 모두 거짓이 된다.
      if (!n || typeof n.id !== 'number' || !Number.isFinite(n.id)) return;
      const { lastSeenId } = get();
      set(prev => ({
        unreadCount: prev.unreadCount + 1,
        arrivals: countArrivals(prev.arrivals, [n]),
      }));
      // 기준선이 아직 없으면(초기 폴링 전) 토스트를 띄우지 않고 기준선만 세운다.
      if (lastSeenId !== null && n.id > lastSeenId) {
        set(prev => ({ toast: n, toastMore: prev.toast ? prev.toastMore + 1 : 0 }));
      }
      set({ lastSeenId: Math.max(lastSeenId ?? 0, n.id) });
    });

    // 응답이 200/text-event-stream 이 아니면 브라우저가 재연결하지 않으므로 직접 백오프로 다시 잇는다.
    source.addEventListener('error', () => {
      // 새 연결로 갈아탄 뒤 늦게 도착한 오류는 무시한다
      if (get()._source !== source) return;
      set({ isLive: false });
      if (source.readyState !== EventSource.CLOSED) return;
      source.close();
      const { _subscribers, _retry } = get();
      set({ _source: null, _retry: _retry + 1 });
      if (_subscribers <= 0) return; // 아무도 보고 있지 않으면 그만둔다
      window.setTimeout(
        () => {
          if (get()._subscribers > 0) get()._connect();
        },
        Math.min(30_000, 2000 * 2 ** _retry)
      );
    });

    set({ _source: source });
  },

  start: () => {
    const s = get();
    set({ _subscribers: s._subscribers + 1 });
    if (s._timer) return; // 이미 동작 중

    void get().poll(); // 마운트 즉시 1회(기준선 설정 + 초기 뱃지)
    get()._connect();

    // 탭이 화면에 나오면 밀린 것을 훑고, 물러나 있었으면 다시 연결한다.
    const onVisible = () => {
      if (document.hidden) return;
      void get().poll();
      if (get()._standDown && !get()._source) get()._connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    set({ _onVisible: onVisible });

    // SSE 연결 여부에 따라 주기가 달라지므로 매 tick 마다 현재 상태를 확인한다.
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += POLL_INTERVAL_FALLBACK;
      const interval = get().isLive ? POLL_INTERVAL_WITH_SSE : POLL_INTERVAL_FALLBACK;
      if (elapsed < interval) return;
      elapsed = 0;
      void get().poll();
      // 물러나 있고 지금 보고 있는 탭이면 다시 연결을 시도한다.
      if (get()._standDown && !document.hidden && !get()._source) get()._connect();
    }, POLL_INTERVAL_FALLBACK);

    set({ _timer: timer });
  },

  stop: () => {
    const s = get();
    const subs = Math.max(0, s._subscribers - 1);
    set({ _subscribers: subs });
    if (subs > 0) return;

    if (s._timer) clearInterval(s._timer);
    s._source?.close();
    if (s._onVisible) document.removeEventListener('visibilitychange', s._onVisible);
    set({
      _timer: null,
      _source: null,
      _onVisible: null,
      _standDown: false,
      _retry: 0,
      _localChangeAt: 0,
      isLive: false,
      lastSeenId: null,
      arrivals: {},
      toast: null,
      toastMore: 0,
      unreadCount: 0,
      readIds: new Set<number>(),
    });
  },

  clearToast: () => set({ toast: null, toastMore: 0 }),
  markRead: (id, serverCount) =>
    set(s => {
      const readIds = s.readIds.has(id) ? s.readIds : new Set(s.readIds).add(id);
      // 서버가 센 수가 있으면 그대로 쓴다. 직접 깎으면 스트림 값과 겹쳐 이중 감소가 된다.
      const unreadCount =
        typeof serverCount === 'number'
          ? Math.max(0, serverCount)
          : s.readIds.has(id)
            ? s.unreadCount // 이미 읽은 것
            : Math.max(0, s.unreadCount - 1);
      return { readIds, unreadCount, _localChangeAt: Date.now() };
    }),
  setUnreadCount: n => set({ unreadCount: Math.max(0, n), _localChangeAt: Date.now() }),
  decrementUnread: () =>
    set(s => ({ unreadCount: Math.max(0, s.unreadCount - 1), _localChangeAt: Date.now() })),
}));
