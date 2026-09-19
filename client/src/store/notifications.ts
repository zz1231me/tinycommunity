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

/** 한 번에 받아 오는 알림 수 */
const PAGE_SIZE = 20;
/**
 * 폴링 한 번에 거슬러 올라갈 페이지 수.
 *
 * 스트림이 끊긴 동안 구독 전파 같은 것으로 한 주기에 20개가 넘게 쌓이면, 첫 페이지만 보던
 * 때는 21번째부터가 통째로 묻혔다 — 팝업도, 그 종류를 보는 화면의 갱신 신호도 없이 지나갔다.
 * 기준선(lastSeenId)에 닿을 때까지 이어 받되, 오래 자리를 비운 사람이 수백 개를 한꺼번에
 * 받아 오지는 않도록 다섯 페이지에서 멈춘다(100개). 그 너머는 뱃지 숫자로만 남는다.
 */
const MAX_POLL_PAGES = 5;
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

/** 도착한 알림들을 종류별 횟수에 더한다 */
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
  /** 토스트로 띄울 신규 알림(없으면 null) */
  toast: Notification | null;
  /**
   * 팝업에 떠 있는 것 말고도 그사이 함께 온 새 알림 수 — '외 N건'.
   * 팝업은 가장 최근 하나만 보여 준다. 폴링으로 한 번에 여럿이 오거나, 팝업이 떠 있는
   * 동안 또 오면 앞의 것은 아무 표시 없이 묻혔다.
   */
  toastMore: number;
  /** 폴링 기준선 — 첫 폴링에서 기존 알림이 토스트로 쏟아지지 않게 함 */
  lastSeenId: number | null;
  /** SSE 스트림이 연결된 상태인지 */
  isLive: boolean;
  /**
   * 종류별로 지금까지 새로 도착한 알림 수 (SSE·폴링 어느 쪽으로 왔든).
   *
   * 알림이 오면 그와 관련된 화면이 스스로 다시 읽게 하려는 것이다(useNotificationArrival).
   * 이것이 없어서, 공격을 받거나 도전장이 와도 종 숫자만 바뀌고 화면은 새로고침을
   * 해야 바뀌었다.
   *
   * '마지막 알림 하나' 가 아니라 종류별 횟수인 이유: SSE 가 끊겨 폴링으로 받을 때는 한
   * 주기에 여러 개가 함께 온다. 마지막 하나만 남기면 도전장 뒤에 댓글이 오면 도전장이
   * 묻힌다. toast 를 신호로 쓰지 않는 이유: 읽은 알림이면 비어 있어 신호가 빠진다.
   */
  arrivals: Partial<Record<Notification['type'], number>>;
  _timer: ReturnType<typeof setInterval> | null;
  /** 스트림이 완전히 닫혀 다시 이을 때의 시도 횟수 — 기다리는 시간을 늘린다 */
  _retry: number;
  /** 서버가 연결 수 상한으로 접은 상태 — 이 탭이 화면에 나올 때까지 폴링으로 지낸다 */
  _standDown: boolean;
  /**
   * 화면에서 마지막으로 읽음·삭제를 한 시각.
   *
   * 조회를 보내 둔 사이에 '모두 읽음' 을 누르면, 먼저 떠난 조회가 나중에 도착해 옛 숫자를
   * 그대로 덮어썼다 — 0 으로 만든 뱃지가 다시 2 로 돌아왔다. 떠난 시각보다 뒤에 손을 댔으면
   * 그 응답의 숫자는 이미 낡은 것이라 버린다.
   */
  _localChangeAt: number;
  _source: EventSource | null;
  _subscribers: number;
  poll: () => Promise<void>;
  /** SSE 연결 만들기 — start() 와 재연결이 함께 쓴다 */
  _connect: () => void;
  /** 화면에 나올 때 도는 손잡이 — stop() 에서 떼기 위해 들고 있는다 */
  _onVisible: (() => void) | null;
  start: () => void;
  stop: () => void;
  clearToast: () => void;
  setUnreadCount: (n: number) => void;
  /** 읽음/삭제 시 뱃지를 1 감소 (함수형 업데이트로 빠른 연속 동작의 stale-closure 누락 방지) */
  decrementUnread: () => void;
  /**
   * 이 알림을 읽었다 — 뱃지는 한 번만 줄인다.
   *
   * 팝업과 종 목록이 같은 알림을 따로 들고 있어서, 팝업으로 열고 종 목록에서 또 누르면
   * (서버 읽음 처리는 두 번 다 성공한다) 뱃지가 두 번 줄어 실제보다 적게 보였다.
   * 여기 모아 두면 어느 쪽에서 읽든 한 번만 줄고, 목록도 이 표를 보고 읽음으로 그린다.
   */
  markRead: (id: number, serverCount?: number) => void;
  /** 이번 세션에서 읽은 알림 id — 팝업과 목록이 같은 상태를 보게 한다 */
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
    // 탭이 백그라운드면 요청 생략 — 다음 주기에서 갱신.
    // 다만 기준선(lastSeenId)이 아직 없으면 거른다. 숨은 탭에서 시작하면(세션 복원,
    // 새 탭으로 열기) 기준선이 없는 채로 남아, 그 뒤 처음 오는 알림이 팝업 없이 지나갔다.
    if (typeof document !== 'undefined' && document.hidden && get().lastSeenId !== null) return;
    const startedAt = Date.now();
    try {
      const res = await getNotifications(undefined, PAGE_SIZE);
      const list: Notification[] = res?.notifications ?? [];
      // 떠난 뒤에 화면에서 읽음·삭제를 했으면 이 응답의 숫자는 낡았다 — 목록만 쓴다
      if (get()._localChangeAt < startedAt) set({ unreadCount: res?.unreadCount ?? 0 });

      const latest = list[0]; // id DESC 정렬이라 [0]이 최신
      if (!latest) return;

      const { lastSeenId } = get();
      if (lastSeenId === null) {
        set({ lastSeenId: latest.id }); // 첫 폴링: 기준선만 설정(토스트 X)
        return;
      }
      if (latest.id > lastSeenId) {
        // 이번에 새로 알게 된 것을 모두 센다 — 가장 최근 것만이 아니다.
        // 첫 페이지가 전부 새것이면 그 너머에도 더 있다 — 기준선에 닿을 때까지 이어 받는다.
        const fresh = list.filter(n => n.id > lastSeenId);
        let cursor = res?.nextCursor ?? null;
        for (
          let page = 1;
          page < MAX_POLL_PAGES && cursor !== null && fresh.length === page * PAGE_SIZE;
          page++
        ) {
          // 뒷장 하나가 실패해도 여기서 멈출 뿐, 첫 장에서 안 것까지 버리지는 않는다
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
        // 이어 받는 사이에 스트림으로 더 최근 것이 왔을 수 있다 — 기준선을 뒤로 물리지 않는다.
        // 물리면 그 알림을 다음 폴링이 '새것' 으로 다시 세어 팝업이 두 번 떴다.
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
      // 폴링 실패는 조용히 무시 — 다음 주기 재시도
    }
  },

  /**
   * SSE 연결 하나를 만든다 — start() 와, 완전히 닫혔을 때의 재연결이 함께 쓴다.
   * 이미 연결이 있으면 아무것도 하지 않는다.
   */
  _connect: () => {
    if (typeof EventSource === 'undefined' || get()._source) return;
    let source: EventSource;
    try {
      // EventSource 는 헤더를 못 붙이지만 인증이 HttpOnly 쿠키라 자동으로 실린다.
      // withCredentials 는 same-origin 에선 불필요하지만, 다른 오리진 배포를 위해 켠다.
      source = new EventSource('/api/notifications/stream', { withCredentials: true });
    } catch (err) {
      logger.error('알림 스트림 연결 실패 — 폴링으로 동작합니다', err);
      return;
    }

    source.addEventListener('open', () => {
      set({ isLive: true, _retry: 0, _standDown: false });
      // 끊겼다 이어지는 동안 생긴 알림은 스트림으로 오지 않는다 — 이어지면 한 번 훑는다.
      // 이것이 없으면 그 알림들은 최대 5분 뒤 폴링 때까지 팝업도, 화면 갱신 신호도 없었다.
      void get().poll();
    });

    // 서버가 연결 수 상한 때문에 이 연결을 접었다 — 다시 이으면 다른 탭을 밀어내고, 그 탭이
    // 또 다시 이어 끝없이 돌아간다. 조용히 물러나 폴링으로 지낸다.
    // 이 탭이 다시 화면에 나오면 그때 자리를 잡는다(아래 visibilitychange).
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
      // id 가 숫자가 아니면 버린다 — NaN 이 기준선에 들어가면 그 뒤 모든 비교가 거짓이 되어
      // 이 세션에서는 팝업이 영영 뜨지 않는다(조용히).
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

    // 잠깐 끊긴 것이면 EventSource 가 스스로 다시 잇는다. 그동안은 폴링이 받아낸다.
    //
    // 다만 응답이 200/text-event-stream 이 아니면(배포 중 502, 세션 만료 401) 브라우저는
    // 연결을 '닫고' 다시 잇지 않는다. 그대로 두면 _source 가 남아 새로고침 전까지 영영
    // 폴링으로만 돌았다 — 닫힌 것을 치우고 시간을 늘려 가며 다시 잇는다.
    source.addEventListener('error', () => {
      // 이미 물러났거나(bye) 새 연결로 갈아탄 뒤 늦게 도착한 오류는 무시한다 —
      // 그대로 두면 멀쩡한 새 연결의 상태를 건드리고, 연결이 둘 생기기도 한다.
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
    if (s._timer) return; // 이미 동작 중 — 연결·타이머를 함께 쓴다

    void get().poll(); // 마운트 즉시 1회(기준선 설정 + 초기 뱃지)
    get()._connect();

    // 이 탭이 화면에 나오면: 밀린 것을 한 번 훑고, 자리가 없어 물러나 있었다면 다시 잡는다.
    // 보고 있는 탭이 실시간을 갖는 것이 맞다 — 밀려나는 쪽은 뒤에 있는 탭이다.
    const onVisible = () => {
      if (document.hidden) return;
      void get().poll();
      if (get()._standDown && !get()._source) get()._connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    set({ _onVisible: onVisible });

    // ── 폴링 폴백 ──
    // SSE 연결 여부에 따라 주기를 바꾸므로, 매 tick 마다 현재 상태를 확인한다.
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += POLL_INTERVAL_FALLBACK;
      const interval = get().isLive ? POLL_INTERVAL_WITH_SSE : POLL_INTERVAL_FALLBACK;
      if (elapsed < interval) return;
      elapsed = 0;
      void get().poll();
      // 자리가 없어 물러나 있고(bye) 지금 보고 있는 탭이면 한 번 다시 잡아 본다.
      // 화면 전환(visibilitychange)만 기다리면, 처음부터 보고 있던 탭은 영영 물러난 채였다.
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
      // 서버가 센 수가 있으면 그대로 쓴다. 스스로 하나 깎으면, 같은 순간 스트림으로 밀어 준
      // 수(이미 반영된 값)에 또 깎여 뱃지가 실제보다 적어졌다.
      const unreadCount =
        typeof serverCount === 'number'
          ? Math.max(0, serverCount)
          : s.readIds.has(id)
            ? s.unreadCount // 이미 읽은 것 — 또 줄이지 않는다
            : Math.max(0, s.unreadCount - 1);
      return { readIds, unreadCount, _localChangeAt: Date.now() };
    }),
  setUnreadCount: n => set({ unreadCount: Math.max(0, n), _localChangeAt: Date.now() }),
  decrementUnread: () =>
    set(s => ({ unreadCount: Math.max(0, s.unreadCount - 1), _localChangeAt: Date.now() })),
}));
