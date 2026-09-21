// client/src/components/Dashboard/NotificationBell.tsx
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

/** 오늘 · 어제 · 이전 으로 묶는다 — 받은 순서(최신 먼저)는 그대로 둔다 */
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

/**
 * 알림 한 줄. memo 로 감싼다 — 종 숫자 하나 바뀌거나 창 자리가 바뀔 때마다 스무 줄이 통째로
 * 다시 그려져 한 번에 40ms 씩 걸렸다. 줄은 자기 알림이 바뀔 때만 다시 그리면 된다.
 * (그래서 onRead·onDelete 는 부르는 쪽에서 useCallback 으로 고정한다.)
 */
const NotificationRow = memo(function NotificationRow({
  n,
  read,
  minuteTick,
  onRead,
  onDelete,
}: {
  n: Notification;
  /** 팝업에서 읽은 것까지 친 '읽음' — n.isRead 만 보면 두 곳이 어긋난다 */
  read: boolean;
  /** 1분마다 바뀐다 — 이 값이 없으면 memo 때문에 '방금 전' 이 그대로 굳는다 */
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
      // 클릭만 받던 행이라 키보드로는 알림을 열 수 없었다
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        // 안쪽 삭제 단추에서 올라온 키는 그 단추의 몫이다
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRead(n);
        }
      }}
      className={`group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-700/50 dark:focus-visible:bg-slate-700/50 ${
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
      {/* 타입 아이콘 */}
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
  const markRead = useNotificationStore(s => s.markRead);
  // 팝업에서 읽은 것도 여기서 읽음으로 보이게 — 두 곳이 같은 표를 본다
  const readIds = useNotificationStore(s => s.readIds);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  // 알림 fetch 실패 시 사용자에게 안내 + 재시도 버튼 제공 (이전엔 무음 catch라
  // "알림 없음" 빈 상태와 "에러" 빈 상태가 구분되지 않았음)
  const [fetchError, setFetchError] = useState(false);
  // 전체 삭제 2단계 확인(실수 클릭 방지) + 진행 상태
  const [confirmClear, setConfirmClear] = useState(false);
  // 전체 / 안 읽은 것만 — 쌓인 알림 사이에서 아직 안 본 것만 골라 보게
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  // 열어 둔 동안 '방금 전' 이 굳지 않게 1분마다 시간 표시를 새로 그린다(줄이 memo 라 값이 필요하다)
  const [minuteTick, setMinuteTick] = useState(0);
  const [clearing, setClearing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null); // 벨 버튼 래퍼(앵커)
  const dropdownRef = useRef<HTMLDivElement>(null); // body로 포털된 드롭다운
  const bellRef = useRef<HTMLButtonElement>(null);
  // 포털된 드롭다운 위치 — 헤더의 backdrop-blur가 position:fixed의 containing block이 되어
  // 헤더 안에서 fixed로 두면 트랩되므로(모바일 정렬 깨짐) body로 포털하고 벨 rect 기준으로 계산한다.
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
      // 깃발은 세대와 상관없이 내린다. 목록을 여는 사이 알림이 오거나 무엇을 지우면 세대가
      // 올라가는데, 그때 내리지 않아 패널이 영영 '불러오는 중' 으로 멈춰 있었다.
      setLoading(false);
    }
  }, [setStoreUnread]);

  // 패널을 열어 둔 동안 새 알림이 오면 맨 위에 붙인다. 예전에는 종 숫자만 오르고 목록은
  // 닫았다 다시 열어야 보였다. 첫 페이지만 다시 받아 이미 가진 것보다 새것만 앞에 붙인다 —
  // 통째로 바꾸면 '더 보기' 로 불러 둔 뒤쪽 알림과 스크롤 위치가 날아간다.
  useNotificationArrival('all', () => {
    if (!open) return;
    // 이 요청이 나간 뒤에 사용자가 지우거나 모두 읽으면(그 손길이 세대를 올린다) 결과를 버린다 —
    // 그러지 않으면 방금 지운 알림이 목록에 되살아나고, 0 으로 만든 뱃지가 옛 숫자로 돌아왔다.
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
      // 패널 재오픈 등으로 목록이 교체됐다면(gen 변경) stale 페이지를 append 하지 않는다.
      if (reqGenRef.current !== gen) return;
      setNotifications(prev => [
        ...prev,
        ...(Array.isArray(data?.notifications) ? data.notifications : []),
      ]);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      // 조용히 넘기면 '더 보기' 가 잠깐 돌다 아무것도 안 붙어, 더 없는 것과 구분되지 않는다
      toast.error('알림을 더 불러오지 못했습니다.');
    } finally {
      // 위와 같은 이유 — 내리지 않으면 '로드 중...' 인 채로 다시 누를 수 없었다
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // 폴링은 useNotificationStore가 단일 수행 — 벨은 라이프사이클에만 참여(타이머 공유).
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

  // 패널 열릴 때 목록 로드 + 전체삭제 확인 상태 초기화(이전에 열었을 때 남은 확인 상태 제거)
  useEffect(() => {
    if (open) {
      fetchNotifications();
      setConfirmClear(false);
    }
  }, [open, fetchNotifications]);

  // 키보드로도 쓸 수 있게 — 목록은 body 끝으로 포털되어 벨에서 Tab 을 눌러도 닿지 않는다.
  // 열리면 목록으로 포커스를 옮기고, Esc 로 닫으면 벨로 되돌린다.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() =>
      dropdownRef.current?.focus({ preventScroll: true })
    );
    const onKey = (e: KeyboardEvent) => {
      // 위에 대화상자가 떠 있으면 ESC 는 그쪽 몫이다 — 한 번에 둘이 닫히지 않게
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

  // 외부 클릭 닫기 — 포털된 드롭다운도 "안쪽"으로 취급(둘 다 벗어날 때만 닫힘)
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

  // 포털 드롭다운 위치 — 벨 rect 기준. 열림 중 resize/scroll 에 따라간다.
  //
  // 자리를 state 로 두지 않고 DOM 에 바로 쓴다. state 로 두었을 때는 스크롤 한 번마다 목록
  // 전체가 다시 그려졌다(20줄에 30ms, 50줄이면 48ms — 스크롤 한 번에 한 프레임씩 버렸다).
  // 자리는 화면에 보이는 위치일 뿐 목록 내용과 아무 상관이 없다.
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

  // useCallback 으로 고정한다 — 줄(NotificationRow)이 memo 라 함수가 매번 새로 생기면 memo 가 헛돈다
  const handleRead = useCallback(
    async (n: Notification) => {
      try {
        const res = await markAsRead(n.id);
        setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, isRead: true } : x)));
        // 뱃지는 서버가 센 수를 그대로 쓴다 — 스스로 깎으면 스트림으로 밀어 준 수에 또 깎인다
        markRead(n.id, res?.unreadCount);
      } catch {
        toast.error('알림을 읽음으로 표시하지 못했습니다.');
      }
      if (n.link) {
        setOpen(false);
        navigate(n.link);
      }
      // link가 없으면 "이동할 페이지 없음" — 사용자에게 무동작으로 보이지 않게 패널을 닫고
      // 시각적으로 읽음 상태(아래 dot 사라짐 + opacity 조정)로 피드백.
      // setOpen(false) 호출은 link 분기에만 했으므로, link 없을 때도 패널을 유지하지만
      // 읽음 상태로 즉시 반영되도록 위에서 이미 처리됨. 추가 토스트는 노이즈가 되므로 생략.
    },
    [markRead, navigate, setOpen]
  );

  const handleMarkAll = async () => {
    // 세대를 올려 둔다 — 아직 오는 중인 조회가 방금 읽은 것들을 '안 읽음' 으로 되돌리지 않게
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
      // 파괴적 일괄 작업은 무음 실패 시 사용자가 성공으로 오인하므로 명시적 피드백 제공
      // (목록은 유지되어 재시도 가능)
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
        // 뱃지는 서버가 센 수를 그대로 쓴다(스스로 깎으면 밀어 준 수에 또 깎인다)
        setStoreUnread(res?.unreadCount ?? 0);
      } catch {
        toast.error('알림을 삭제하지 못했습니다.');
      }
    },
    [setStoreUnread]
  );

  // 팝업에서 읽은 것(readIds)도 읽음으로 친다 — 두 곳이 다른 상태를 보이면 안 된다
  const isRead = (n: Notification) => n.isRead || readIds.has(n.id);
  const visible = filter === 'unread' ? notifications.filter(n => !isRead(n)) : notifications;
  const groups = groupByDay(visible);

  return (
    <div ref={panelRef} className="relative">
      {/* 벨 버튼 */}
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
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-2xs font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 패널 — body로 포털(헤더 backdrop-blur의 containing block 트랩 회피).
          위치는 pos(벨 rect 기준)로 fixed 지정. */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dropdownRef}
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              // top/left/right/width 는 place() 가 DOM 에 직접 쓴다(위 주석)
              style={{ originX: 1, originY: 0, position: 'fixed' }}
              role="dialog"
              aria-label="알림 목록"
              tabIndex={-1}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-[70] overflow-hidden"
            >
              {/* 헤더 */}
              <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 pb-2.5 pt-3 dark:border-slate-700 dark:from-slate-800 dark:to-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    알림
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-px text-2xs font-bold tabular-nums text-white">
                        {unreadCount}
                      </span>
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
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
