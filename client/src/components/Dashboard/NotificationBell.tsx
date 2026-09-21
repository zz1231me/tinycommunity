import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, ChevronRight, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { stagger, listItem, scaleIn } from '../../utils/animations';
import { useUIOverlays } from '../../store/uiOverlays';
import { hasOpenDialog } from '../../hooks/useFocusTrap';
import { useNotificationStore } from '../../store/notifications';
import { toast } from '../../utils/toast';
import { kindOf } from '../common/notificationKinds';
import { useNotificationArrival } from '../../hooks/useNotificationArrival';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from '../../api/notifications';

interface Notification {
  id: number;
  type:
    | 'COMMENT'
    | 'LIKE'
    | 'MENTION'
    | 'SUBSCRIPTION'
    | 'ASSIGNMENT'
    | 'MESSAGE'
    | 'DUEL'
    | 'ATTACK'
    | 'SYSTEM';
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 오늘·어제·이전으로 묶는다. 받은 순서는 그대로 둔다. */
function groupByDay<T extends { createdAt: string }>(items: T[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const yesterday = today - 24 * 3600_000;
  const groups: Array<{ label: string; items: T[] }> = [];
  for (const item of items) {
    const at = new Date(item.createdAt).getTime();
    const label = at >= today ? '오늘' : at >= yesterday ? '어제' : '이전';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** 알림 한 줄. 목록 전체가 다시 그려지지 않게 memo 로 감싼다. onRead·onDelete 는 호출부에서 useCallback 으로 고정한다. */
const NotificationRow = memo(function NotificationRow({
  n,
  read,
  minuteTick,
  onRead,
  onDelete,
}: {
  n: Notification;
  /** 팝업에서 읽은 것까지 포함한 읽음 여부 */
  read: boolean;
  /** 1분마다 바뀐다. 없으면 memo 때문에 '방금 전' 이 굳는다. */
  minuteTick: number;
  onRead: (n: Notification) => void;
  onDelete: (e: React.MouseEvent, id: number) => void;
}) {
  void minuteTick;
  const typeInfo = kindOf(n.type);
  return (
    <motion.div
      variants={listItem}
      onClick={() => onRead(n)}
      // 키보드로도 열 수 있게 한다
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        // 안쪽 삭제 단추의 키 입력은 그쪽에서 처리한다
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRead(n);
        }
      }}
      className={`group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:hover:bg-slate-700/50 dark:focus-visible:bg-slate-700/50 ${
        !read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
      }`}
    >
      {/* 안 읽은 것은 왼쪽에 종류 색 띠 */}
      {!read && (
        <span
          aria-hidden
          className={`absolute inset-y-2 left-0 w-0.5 rounded-r ${typeInfo.accent}`}
        />
      )}
      <span
        className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${typeInfo.bg} ${typeInfo.color}`}
      >
        {typeInfo.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-2xs">
          <span className={`font-semibold ${typeInfo.color}`}>{typeInfo.title}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="text-slate-400">{formatTime(n.createdAt)}</span>
        </p>
        <p
          className={`mt-0.5 line-clamp-2 text-sm leading-snug ${!read ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}
        >
          {n.message}
        </p>
      </div>

      <div className="ml-1 flex flex-shrink-0 items-center gap-1">
        {!read && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary-500" />}
        {n.link && (
          <ChevronRight
            aria-hidden
            className="hidden h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 sm:block"
          />
        )}
        <button
          onClick={e => onDelete(e, n.id)}
          className="min-w-[36px] min-h-[36px] p-2 inline-flex items-center justify-center text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label="알림 삭제"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
});

export function NotificationBell() {
  // 다른 드롭다운과 배타적으로 열리고, 모바일 사이드바가 열리면 닫힌다.
  const open = useUIOverlays(s => s.activeDropdown === 'notifications');
  // dep 을 비워 매 렌더 같은 ref 를 유지하고, prev 는 스토어에서 직접 읽어 stale closure 를 피한다.
  const setOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const state = useUIOverlays.getState();
    const currentOpen = state.activeDropdown === 'notifications';
    const next = typeof value === 'function' ? value(currentOpen) : value;
    if (next) state.openDropdown('notifications');
    else state.closeDropdown('notifications');
  }, []);
  // unreadCount 는 단일 폴링 스토어에서 구독한다.
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const setStoreUnread = useNotificationStore(s => s.setUnreadCount);
  const markRead = useNotificationStore(s => s.markRead);
  // 팝업에서 읽은 것도 읽음으로 보이도록 같은 표를 본다.
  const readIds = useNotificationStore(s => s.readIds);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  // 조회 실패와 '알림 없음' 을 구분해 안내와 재시도 버튼을 보여 준다.
  const [fetchError, setFetchError] = useState(false);
  // 전체 삭제는 2단계로 확인한다.
  const [confirmClear, setConfirmClear] = useState(false);
  // 전체 / 안 읽은 것만 보기
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  // 1분마다 시간 표시를 다시 그린다. 줄이 memo 라 값이 필요하다.
  const [minuteTick, setMinuteTick] = useState(0);
  const [clearing, setClearing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null); // 벨 버튼 래퍼(앵커)
  const dropdownRef = useRef<HTMLDivElement>(null); // body로 포털된 드롭다운
  const bellRef = useRef<HTMLButtonElement>(null);
  // 헤더의 backdrop-blur 가 fixed 의 containing block 이 되므로 body 로 포털하고 벨 rect 기준으로 위치를 잡는다.
  // 패널을 다시 열었을 때 늦게 도착한 stale 페이지를 붙이지 않도록 세대 번호로 무효화한다.
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
      // 로딩 표시는 세대와 상관없이 내린다. 그러지 않으면 패널이 '불러오는 중' 에서 멈춘다.
      setLoading(false);
    }
  }, [setStoreUnread]);

  // 패널이 열린 동안 새 알림이 오면 첫 페이지만 다시 받아 새것만 앞에 붙인다. 통째로 바꾸면 더 보기 결과와 스크롤이 날아간다.
  useNotificationArrival('all', () => {
    if (!open) return;
    // 이 요청 뒤에 사용자가 지우거나 모두 읽으면 세대가 올라가므로 결과를 버린다.
    const gen = ++reqGenRef.current;
    void getNotifications(undefined, 20)
      .then(data => {
        if (reqGenRef.current !== gen) return;
        const fresh: Notification[] = Array.isArray(data?.notifications) ? data.notifications : [];
        setNotifications(prev => {
          const newest = prev.reduce((max, x) => Math.max(max, x.id), 0);
          const added = fresh.filter(x => x.id > newest);
          return added.length > 0 ? [...added, ...prev] : prev;
        });
        setStoreUnread(data?.unreadCount ?? 0);
      })
      .catch(() => {
        /* 다음에 열 때 다시 받는다 */
      });
  });

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const gen = reqGenRef.current;
    setLoadingMore(true);
    try {
      const data = await getNotifications(nextCursor, 20);
      // 목록이 교체됐으면(gen 변경) stale 페이지를 붙이지 않는다.
      if (reqGenRef.current !== gen) return;
      setNotifications(prev => [
        ...prev,
        ...(Array.isArray(data?.notifications) ? data.notifications : []),
      ]);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      // 조용히 넘기면 더 불러올 것이 없는 상태와 구분되지 않는다.
      toast.error('알림을 더 불러오지 못했습니다.');
    } finally {
      // 내리지 않으면 로딩 상태에서 다시 누를 수 없다.
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // 폴링은 useNotificationStore 가 전담하고 벨은 라이프사이클에만 참여한다.
  useEffect(() => {
    const { start, stop } = useNotificationStore.getState();
    start();
    return () => stop();
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setMinuteTick(t => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  // 패널이 열리면 목록을 불러오고 전체삭제 확인 상태를 초기화한다.
  useEffect(() => {
    if (open) {
      fetchNotifications();
      setConfirmClear(false);
    }
  }, [open, fetchNotifications]);

  // 목록이 body 로 포털되어 Tab 으로 닿지 않는다. 열리면 목록으로 포커스를 옮기고 Esc 로 닫으면 벨로 되돌린다.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() =>
      dropdownRef.current?.focus({ preventScroll: true })
    );
    const onKey = (e: KeyboardEvent) => {
      // 위에 대화상자가 있으면 ESC 는 그쪽에서 처리한다.
      if (e.key !== 'Escape' || hasOpenDialog()) return;
      setOpen(false);
      bellRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  // 포털된 드롭다운도 안쪽으로 취급해 둘 다 벗어날 때만 닫는다.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const inAnchor = panelRef.current?.contains(t);
      const inDropdown = dropdownRef.current?.contains(t);
      if (!inAnchor && !inDropdown) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  // 벨 rect 기준으로 위치를 잡고 resize·scroll 을 따라간다. state 가 아니라 DOM 에 직접 써야 스크롤마다 목록이 다시 그려지지 않는다.
  const place = useCallback(() => {
    const anchor = panelRef.current;
    const node = dropdownRef.current;
    if (!anchor || !node) return;
    const r = anchor.getBoundingClientRect();
    node.style.top = `${r.bottom + 8}px`;
    if (window.matchMedia('(min-width: 640px)').matches) {
      // 데스크톱: 벨 오른쪽 정렬, 24rem 폭
      node.style.left = '';
      node.style.right = `${Math.round(window.innerWidth - r.right)}px`;
      node.style.width = 'min(24rem, calc(100vw - 1rem))';
    } else {
      // 모바일: 좌우 8px 여백 풀폭 시트
      node.style.left = '8px';
      node.style.right = '8px';
      node.style.width = '';
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place(); // 그려지기 전에 자리를 잡는다 — 첫 그림이 엉뚱한 자리에서 튀지 않게
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  // NotificationRow 가 memo 라 함수를 useCallback 으로 고정한다.
  const handleRead = useCallback(
    async (n: Notification) => {
      try {
        const res = await markAsRead(n.id);
        setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, isRead: true } : x)));
        // 뱃지는 서버가 센 수를 그대로 쓴다. 직접 깎으면 이중으로 줄어든다.
        markRead(n.id, res?.unreadCount);
      } catch {
        toast.error('알림을 읽음으로 표시하지 못했습니다.');
      }
      if (n.link) {
        setOpen(false);
        navigate(n.link);
      }
      // link 가 없으면 이동하지 않고 읽음 표시만 남긴다.
    },
    [markRead, navigate, setOpen]
  );

  const handleMarkAll = async () => {
    // 아직 오는 중인 조회가 읽은 것을 되돌리지 않도록 세대를 올린다.
    reqGenRef.current++;
    try {
      const res = await markAllAsRead();
      setNotifications(prev => prev.map(x => ({ ...x, isRead: true })));
      setStoreUnread(res?.unreadCount ?? 0);
    } catch {
      toast.error('모두 읽음으로 표시하지 못했습니다.');
    }
  };

  const handleClearAll = async () => {
    if (clearing) return;
    reqGenRef.current++; // 위와 같은 이유 — 오는 중인 조회가 지운 목록을 되살리지 않게
    setClearing(true);
    try {
      await deleteAllNotifications();
      setNotifications([]);
      setNextCursor(null);
      setStoreUnread(0);
      setConfirmClear(false);
    } catch {
      // 조용히 실패하면 성공으로 오인하므로 알린다. 목록은 유지되어 다시 시도할 수 있다.
      toast.error('알림 전체 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setClearing(false);
    }
  };

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      reqGenRef.current++; // 오는 중인 조회가 지운 줄을 되살리지 않게
      try {
        const res = await deleteNotification(id);
        setNotifications(prev => prev.filter(x => x.id !== id));
        // 뱃지는 서버가 센 수를 그대로 쓴다.
        setStoreUnread(res?.unreadCount ?? 0);
      } catch {
        toast.error('알림을 삭제하지 못했습니다.');
      }
    },
    [setStoreUnread]
  );

  // 팝업에서 읽은 것(readIds)도 읽음으로 친다.
  const isRead = (n: Notification) => n.isRead || readIds.has(n.id);
  const visible = filter === 'unread' ? notifications.filter(n => !isRead(n)) : notifications;
  const groups = groupByDay(visible);

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={bellRef}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        aria-label={`알림${unreadCount > 0 ? ` ${unreadCount}개 미읽음` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="badge-count absolute -right-0.5 -top-0.5 bg-red-500 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 패널. body 로 포털하고 벨 rect 기준으로 fixed 위치를 지정한다. */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropdownRef}
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              // top/left/right/width 는 place() 가 DOM 에 직접 쓴다
              style={{ originX: 1, originY: 0, position: 'fixed' }}
              role="dialog"
              aria-label="알림 목록"
              tabIndex={-1}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-[70] overflow-hidden"
            >
              <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 pb-2.5 pt-3 dark:border-slate-700 dark:from-slate-800 dark:to-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    알림
                    {unreadCount > 0 && (
                      <span className="badge-count bg-red-500 text-white">{unreadCount}</span>
                    )}
                  </h3>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAll}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        모두 읽음
                      </button>
                    )}
                    {notifications.length > 0 &&
                      !loading &&
                      !fetchError &&
                      (confirmClear ? (
                        <span className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 dark:bg-red-500/10">
                          <span className="text-xs text-red-700 dark:text-red-300">전체 삭제?</span>
                          <button
                            onClick={handleClearAll}
                            disabled={clearing}
                            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                          >
                            {clearing ? '삭제 중...' : '삭제'}
                          </button>
                          <button
                            onClick={() => setConfirmClear(false)}
                            className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"
                          >
                            취소
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmClear(true)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          전체 삭제
                        </button>
                      ))}
                  </div>
                </div>
                {notifications.length > 0 && !loading && !fetchError && (
                  <div role="group" aria-label="알림 거르기" className="mt-2 flex gap-1">
                    {(
                      [
                        ['all', '전체'],
                        ['unread', '안 읽음'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        aria-pressed={filter === key}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          filter === key
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                      >
                        {label}
                        {key === 'unread' && unreadCount > 0 && (
                          <span className="ml-1 tabular-nums opacity-70">{unreadCount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                  <button onClick={fetchNotifications} className="btn-primary text-xs">
                    다시 시도
                  </button>
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                  <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700/60">
                    <BellOff className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {filter === 'unread' && notifications.length > 0
                      ? '안 읽은 알림이 없습니다'
                      : '새 알림이 없습니다'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {filter === 'unread' && notifications.length > 0
                      ? '모두 확인했어요 👍'
                      : '댓글·멘션·대결 소식이 여기에 모입니다'}
                  </p>
                </div>
              ) : (
                <motion.div
                  variants={stagger}
                  initial="hidden"
                  animate="visible"
                  className="max-h-[26rem] overflow-y-auto"
                >
                  {groups.map(group => (
                    <div key={group.label}>
                      <p className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-slate-400 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
                        {group.label}
                      </p>
                      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {group.items.map(n => (
                          <NotificationRow
                            key={n.id}
                            n={n}
                            read={isRead(n)}
                            minuteTick={minuteTick}
                            onRead={handleRead}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

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
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
