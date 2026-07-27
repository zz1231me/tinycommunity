// client/src/components/Dashboard/NotificationBell.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessageSquare, Heart, AtSign, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { stagger, listItem, scaleIn } from '../../utils/animations';
import { useUIOverlays } from '../../store/uiOverlays';
import { useNotificationStore } from '../../store/notifications';
import { toast } from '../../utils/toast';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from '../../api/notifications';

interface Notification {
  id: number;
  type: 'COMMENT' | 'LIKE' | 'MENTION' | 'SYSTEM';
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  COMMENT: {
    icon: <MessageSquare className="w-4 h-4" />,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    color: 'text-blue-600 dark:text-blue-400',
  },
  LIKE: {
    icon: <Heart className="w-4 h-4" />,
    bg: 'bg-red-100 dark:bg-red-900/30',
    color: 'text-red-500 dark:text-red-400',
  },
  MENTION: {
    icon: <AtSign className="w-4 h-4" />,
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    color: 'text-violet-600 dark:text-violet-400',
  },
  SYSTEM: {
    icon: <Bell className="w-4 h-4" />,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    color: 'text-amber-600 dark:text-amber-400',
  },
};

export function NotificationBell() {
  // 통합 overlay store — 다른 dropdown(userMenu/search 등)과 자동 배타.
  // 모바일 사이드바가 열리면 자동으로 닫힌다.
  const open = useUIOverlays(s => s.activeDropdown === 'notifications');
  // setOpen은 useCallback dep을 비워 매 렌더에서 동일 ref 유지 (useEffect cleanup→setup 사이클 차단).
  // 함수형 호출 시 prev는 store의 최신 상태에서 직접 읽어 stale closure 위험도 차단.
  const setOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const state = useUIOverlays.getState();
    const currentOpen = state.activeDropdown === 'notifications';
    const next = typeof value === 'function' ? value(currentOpen) : value;
    if (next) state.openDropdown('notifications');
    else state.closeDropdown('notifications');
  }, []);
  // unreadCount는 단일 폴링 스토어에서 구독(중복 폴링 제거). 뱃지 표시 및 액션 후 동기화에 사용.
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const setStoreUnread = useNotificationStore(s => s.setUnreadCount);
  const decrementUnread = useNotificationStore(s => s.decrementUnread);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  // 알림 fetch 실패 시 사용자에게 안내 + 재시도 버튼 제공 (이전엔 무음 catch라
  // "알림 없음" 빈 상태와 "에러" 빈 상태가 구분되지 않았음)
  const [fetchError, setFetchError] = useState(false);
  // 전체 삭제 2단계 확인(실수 클릭 방지) + 진행 상태
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // 페이지네이션 경합 가드: 패널 재오픈(fetchNotifications)이 in-flight loadMore보다 늦게
  // 도착한 stale 페이지를 append 하지 않도록 세대(generation) 번호로 무효화한다.
  const reqGenRef = useRef(0);
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    const gen = ++reqGenRef.current;
    setLoading(true);
    setFetchError(false);
    setLoadingMore(false); // 이전 페이지네이션 진행상태 초기화(아래 gen 가드와 함께 stale append 방지)
    try {
      const data = await getNotifications(undefined, 20);
      if (reqGenRef.current !== gen) return;
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
      setStoreUnread(data?.unreadCount ?? 0);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      if (reqGenRef.current === gen) setFetchError(true);
    } finally {
      if (reqGenRef.current === gen) setLoading(false);
    }
  }, [setStoreUnread]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const gen = reqGenRef.current;
    setLoadingMore(true);
    try {
      const data = await getNotifications(nextCursor, 20);
      // 패널 재오픈 등으로 목록이 교체됐다면(gen 변경) stale 페이지를 append 하지 않는다.
      if (reqGenRef.current !== gen) return;
      setNotifications(prev => [
        ...prev,
        ...(Array.isArray(data?.notifications) ? data.notifications : []),
      ]);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      /* 알림 API 에러 무시 */
    } finally {
      if (reqGenRef.current === gen) setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // 폴링은 useNotificationStore가 단일 수행 — 벨은 라이프사이클에만 참여(타이머 공유).
  useEffect(() => {
    const { start, stop } = useNotificationStore.getState();
    start();
    return () => stop();
  }, []);

  // 패널 열릴 때 목록 로드 + 전체삭제 확인 상태 초기화(이전에 열었을 때 남은 확인 상태 제거)
  useEffect(() => {
    if (open) {
      fetchNotifications();
      setConfirmClear(false);
    }
  }, [open, fetchNotifications]);

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  const handleRead = async (n: Notification) => {
    try {
      await markAsRead(n.id);
      setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, isRead: true } : x)));
      // 이미 읽은 알림은 카운트를 감소시키지 않음
      if (!n.isRead) decrementUnread();
    } catch {
      /* 알림 API 에러 무시 */
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
    // link가 없으면 "이동할 페이지 없음" — 사용자에게 무동작으로 보이지 않게 패널을 닫고
    // 시각적으로 읽음 상태(아래 dot 사라짐 + opacity 조정)로 피드백.
    // setOpen(false) 호출은 link 분기에만 했으므로, link 없을 때도 패널을 유지하지만
    // 읽음 상태로 즉시 반영되도록 위에서 이미 처리됨. 추가 토스트는 노이즈가 되므로 생략.
  };

  const handleMarkAll = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(x => ({ ...x, isRead: true })));
      setStoreUnread(0);
    } catch {
      /* 알림 API 에러 무시 */
    }
  };

  const handleClearAll = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setNextCursor(null);
      setStoreUnread(0);
      setConfirmClear(false);
    } catch {
      // 파괴적 일괄 작업은 무음 실패 시 사용자가 성공으로 오인하므로 명시적 피드백 제공
      // (목록은 유지되어 재시도 가능)
      toast.error('알림 전체 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setClearing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(x => x.id !== id));
      const deleted = notifications.find(x => x.id === id);
      if (deleted && !deleted.isRead) decrementUnread();
    } catch {
      /* 알림 API 에러 무시 */
    }
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return '방금 전';
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
  };

  return (
    <div ref={panelRef} className="relative">
      {/* 벨 버튼 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        aria-label={`알림${unreadCount > 0 ? ` ${unreadCount}개 미읽음` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 패널 */}
      <AnimatePresence>
        {open && (
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{ originX: 1, originY: 0 }}
            role="dialog"
            aria-label="알림 목록"
            // 모바일: 헤더 바로 아래 가로 전체(여백 8px) 시트 형태로 고정
            // 데스크톱: 알림벨 옆에 24rem 폭 dropdown으로 표시
            className="fixed left-2 right-2 top-14 w-auto sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(24rem,calc(100vw-1rem))] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                알림
                {unreadCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-full font-bold">
                    {unreadCount}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAll}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                  >
                    모두 읽음
                  </button>
                )}
                {notifications.length > 0 &&
                  !loading &&
                  !fetchError &&
                  (confirmClear ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 dark:text-slate-400">전체 삭제?</span>
                      <button
                        onClick={handleClearAll}
                        disabled={clearing}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium disabled:opacity-50"
                      >
                        {clearing ? '삭제 중...' : '삭제'}
                      </button>
                      <button
                        onClick={() => setConfirmClear(false)}
                        className="text-xs text-slate-500 dark:text-slate-400 hover:underline font-medium"
                      >
                        취소
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="text-xs text-red-500 dark:text-red-400 hover:underline font-medium"
                    >
                      전체 삭제
                    </button>
                  ))}
              </div>
            </div>

            {/* 목록 */}
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : fetchError ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-slate-500 dark:text-slate-400">
                <Bell className="w-10 h-10 mb-3 text-red-400 dark:text-red-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  알림을 불러올 수 없습니다
                </p>
                <p className="text-xs mb-4 text-center">
                  네트워크 상태를 확인하고 다시 시도해주세요.
                </p>
                <button
                  onClick={fetchNotifications}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  다시 시도
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500">
                <Bell className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">새 알림이 없습니다</p>
              </div>
            ) : (
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700"
              >
                {notifications.map(n => {
                  const typeInfo = TYPE_ICON[n.type] ?? TYPE_ICON.SYSTEM;
                  return (
                    <motion.div
                      key={n.id}
                      variants={listItem}
                      onClick={() => handleRead(n)}
                      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                        !n.isRead ? 'bg-primary-50/60 dark:bg-primary-900/10' : ''
                      }`}
                    >
                      {/* 타입 아이콘 */}
                      <span
                        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${typeInfo.bg} ${typeInfo.color}`}
                      >
                        {typeInfo.icon}
                      </span>

                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm leading-snug ${!n.isRead ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-400'}`}
                        >
                          {n.message}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {formatTime(n.createdAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                        )}
                        <button
                          onClick={e => handleDelete(e, n.id)}
                          className="min-w-[36px] min-h-[36px] p-2 inline-flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                          aria-label="알림 삭제"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* 더 보기 버튼 */}
            {nextCursor && !loading && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-1.5 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors disabled:opacity-50"
                >
                  {loadingMore ? '로드 중...' : '더 보기'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
