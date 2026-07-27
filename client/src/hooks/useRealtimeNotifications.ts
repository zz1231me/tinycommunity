import { useEffect } from 'react';
import { useNotificationStore } from '../store/notifications';
import { useAuthStore } from '../store/auth';

// 토스트용 신규 알림 구독 — 폴링은 useNotificationStore가 단일 수행한다(중복 폴링 제거).
// 인증 상태일 때만 스토어 폴링 라이프사이클(start/stop)에 참여한다.
export function useRealtimeNotifications() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const newNotification = useNotificationStore(s => s.toast);
  const clearNew = useNotificationStore(s => s.clearToast);

  useEffect(() => {
    if (!isAuthenticated) return;
    const { start, stop } = useNotificationStore.getState();
    start();
    return () => stop();
  }, [isAuthenticated]);

  return { newNotification, clearNew };
}
