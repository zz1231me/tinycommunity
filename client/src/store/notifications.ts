import { create } from 'zustand';
import { getNotifications, type Notification } from '../api/notifications';
import { logger } from '../utils/logger';

// 알림 전달 단일 소스(Single Source of Truth).
// 이 스토어만 서버와 통신하고 벨·토스트는 구독만 한다. 소비자가 각자 폴링하면
// 같은 주기의 요청이 중복으로 나간다.
//
// 전달 경로는 두 가지다:
//  1) SSE(/api/notifications/stream) — 기본. 서버가 알림 생성 즉시 밀어준다.
//  2) 폴링 — 폴백. SSE 가 연결되지 않았거나 끊겼을 때만 짧은 주기로 돈다.
//     SSE 가 연결된 동안에도 아주 긴 주기로 한 번씩 돌려, 프록시가 조용히 스트림을
//     끊었는데 close 이벤트가 오지 않는 경우에도 알림이 유실되지 않게 한다.
//
// - 구독자 참조카운트(_subscribers)로 마지막 소비자가 사라지면 연결/타이머 정리
// - 탭 숨김(document.hidden) 시 폴링 요청 생략(배터리/부하 절감)
const POLL_INTERVAL_FALLBACK = 30_000;
const POLL_INTERVAL_WITH_SSE = 5 * 60_000;

/**
 * SSE 이벤트 본문을 파싱한다. 프레임이 잘리거나 형식이 어긋나도 리스너 안에서 throw 하면
 * 안 되므로(EventSource 리스너의 예외는 아무도 잡지 않는다) null 을 돌려주고 넘어간다.
 * 유실된 이벤트는 폴링 폴백이 메운다.
 */
function parseEvent<T>(evt: Event): T | null {
  try {
    const data = (evt as MessageEvent).data;
    if (typeof data !== 'string' || data.length === 0) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

interface NotificationStoreState {
  unreadCount: number;
  /** 토스트로 띄울 신규 알림(없으면 null) */
  toast: Notification | null;
  /** 폴링 기준선 — 첫 폴링에서 기존 알림이 토스트로 쏟아지지 않게 함 */
  lastSeenId: number | null;
  /** SSE 스트림이 연결된 상태인지 */
  isLive: boolean;
  /**
   * 가장 최근에 새로 도착한 알림 (SSE·폴링 어느 쪽으로 왔든).
   *
   * 알림이 오면 그와 관련된 화면이 스스로 다시 읽게 하려는 것이다(useNotificationArrival).
   * 이것이 없어서, 공격을 받거나 도전장이 와도 종 숫자만 바뀌고 화면은 새로고침을
   * 해야 바뀌었다. toast 와 따로 두는 이유: toast 는 읽은 알림이면 비워 두고, 화면이
   * 띄운 뒤 지운다 — 그 값을 신호로 쓰면 신호가 빠진다.
   */
  lastArrived: Notification | null;
  _timer: ReturnType<typeof setInterval> | null;
  _source: EventSource | null;
  _subscribers: number;
  poll: () => Promise<void>;
  start: () => void;
  stop: () => void;
  clearToast: () => void;
  setUnreadCount: (n: number) => void;
  /** 읽음/삭제 시 뱃지를 1 감소 (함수형 업데이트로 빠른 연속 동작의 stale-closure 누락 방지) */
  decrementUnread: () => void;
}

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  unreadCount: 0,
  toast: null,
  lastSeenId: null,
  isLive: false,
  lastArrived: null,
  _timer: null,
  _source: null,
  _subscribers: 0,

  poll: async () => {
    // 탭이 백그라운드면 요청 생략 — 다음 주기에서 갱신
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await getNotifications(undefined, 20);
      const list: Notification[] = res?.notifications ?? [];
      set({ unreadCount: res?.unreadCount ?? 0 });

      const latest = list[0]; // id DESC 정렬이라 [0]이 최신
      if (!latest) return;

      const { lastSeenId } = get();
      if (lastSeenId === null) {
        set({ lastSeenId: latest.id }); // 첫 폴링: 기준선만 설정(토스트 X)
        return;
      }
      if (latest.id > lastSeenId) {
        set({ lastSeenId: latest.id, lastArrived: latest });
        if (!latest.isRead) set({ toast: latest });
      }
    } catch {
      // 폴링 실패는 조용히 무시 — 다음 주기 재시도
    }
  },

  start: () => {
    const s = get();
    set({ _subscribers: s._subscribers + 1 });
    if (s._timer || s._source) return; // 이미 동작 중 — 연결/타이머 공유

    void get().poll(); // 마운트 즉시 1회(기준선 설정 + 초기 뱃지)

    // ── SSE 연결 ──
    // EventSource 는 헤더를 못 붙이지만 인증이 HttpOnly 쿠키라 자동으로 실린다.
    // withCredentials 는 same-origin 에선 불필요하지만, 다른 오리진에 배포된 경우를 위해 켠다.
    let source: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      try {
        source = new EventSource('/api/notifications/stream', { withCredentials: true });

        source.addEventListener('open', () => set({ isLive: true }));

        source.addEventListener('unread-count', evt => {
          const payload = parseEvent<{ count: number }>(evt);
          if (!payload) return;
          set({ unreadCount: Math.max(0, payload.count) });
        });

        source.addEventListener('notification', evt => {
          const n = parseEvent<Notification>(evt);
          if (!n) return;
          const { lastSeenId } = get();
          set(prev => ({ unreadCount: prev.unreadCount + 1, lastArrived: n }));
          // 기준선이 아직 없으면(초기 폴링 전) 토스트를 띄우지 않고 기준선만 세운다.
          if (lastSeenId !== null && n.id > lastSeenId) set({ toast: n });
          set({ lastSeenId: Math.max(lastSeenId ?? 0, n.id) });
        });

        // EventSource 는 끊기면 스스로 재연결한다. 여기서는 상태만 내려두고,
        // 그동안은 폴링 폴백이 알림을 받아낸다.
        source.addEventListener('error', () => set({ isLive: false }));
      } catch (err) {
        logger.error('알림 스트림 연결 실패 — 폴링으로 동작합니다', err);
        source = null;
      }
    }

    // ── 폴링 폴백 ──
    // SSE 연결 여부에 따라 주기를 바꾸므로, 매 tick 마다 현재 상태를 확인한다.
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += POLL_INTERVAL_FALLBACK;
      const interval = get().isLive ? POLL_INTERVAL_WITH_SSE : POLL_INTERVAL_FALLBACK;
      if (elapsed < interval) return;
      elapsed = 0;
      void get().poll();
    }, POLL_INTERVAL_FALLBACK);

    set({ _timer: timer, _source: source });
  },

  stop: () => {
    const s = get();
    const subs = Math.max(0, s._subscribers - 1);
    set({ _subscribers: subs });
    if (subs > 0) return;

    if (s._timer) clearInterval(s._timer);
    s._source?.close();
    set({
      _timer: null,
      _source: null,
      isLive: false,
      lastSeenId: null,
      lastArrived: null,
      toast: null,
      unreadCount: 0,
    });
  },

  clearToast: () => set({ toast: null }),
  setUnreadCount: n => set({ unreadCount: Math.max(0, n) }),
  decrementUnread: () => set(s => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),
}));
