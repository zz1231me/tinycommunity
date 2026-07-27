import { create } from 'zustand';
import { getNotifications, type Notification } from '../api/notifications';

// 알림 폴링 단일 소스(Single Source of Truth).
// 예전엔 NotificationBell(getUnreadCount 30s)과 useRealtimeNotifications(getNotifications 30s)가
// 각자 폴링해 30초마다 요청이 2번 나갔다. 이 스토어가 폴링을 1번만(getNotifications은 목록+
// unreadCount를 함께 반환) 수행하고, 벨/토스트는 구독만 한다.
// - 구독자 참조카운트(_subscribers)로 마지막 소비자가 사라지면 타이머 정리
// - 탭 숨김(document.hidden) 시 네트워크 요청 생략(배터리/부하 절감)
const POLL_INTERVAL = 30_000;

interface NotificationStoreState {
  unreadCount: number;
  /** 토스트로 띄울 신규 알림(없으면 null) */
  toast: Notification | null;
  /** 폴링 기준선 — 첫 폴링에서 기존 알림이 토스트로 쏟아지지 않게 함 */
  lastSeenId: number | null;
  _timer: ReturnType<typeof setInterval> | null;
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
  _timer: null,
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
        set({ lastSeenId: latest.id });
        if (!latest.isRead) set({ toast: latest });
      }
    } catch {
      // 폴링 실패는 조용히 무시 — 다음 주기 재시도
    }
  },

  start: () => {
    const s = get();
    set({ _subscribers: s._subscribers + 1 });
    if (s._timer) return; // 이미 폴링 중 — 타이머 공유
    void get().poll(); // 마운트 즉시 1회
    const timer = setInterval(() => void get().poll(), POLL_INTERVAL);
    set({ _timer: timer });
  },

  stop: () => {
    const s = get();
    const subs = Math.max(0, s._subscribers - 1);
    set({ _subscribers: subs });
    if (subs === 0 && s._timer) {
      clearInterval(s._timer);
      set({ _timer: null, lastSeenId: null, toast: null, unreadCount: 0 });
    }
  },

  clearToast: () => set({ toast: null }),
  setUnreadCount: n => set({ unreadCount: Math.max(0, n) }),
  decrementUnread: () => set(s => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),
}));
