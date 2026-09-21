// 새 알림이 오면 헤더 아래 오른쪽에 잠깐 뜨는 팝업. 공격·대결은 맨 위 띠로 띄운다.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { useUIOverlays } from '../../store/uiOverlays';
import { useNotificationStore } from '../../store/notifications';
import { markAsRead, type Notification } from '../../api/notifications';
import { kindOf } from './notificationKinds';
import { TopNotice, TopNoticeSlot } from './TopNotice';

export const TOAST_MS = 6000;
/** 받는 사람이 곧 움직여야 하는 알림의 표시 시간. */
export const URGENT_TOAST_MS = 10_000;
const URGENT = new Set<Notification['type']>(['ATTACK', 'DUEL']);

function ToastCard({ n, more, onClose }: { n: Notification; more: number; onClose: () => void }) {
  const navigate = useNavigate();
  const markRead = useNotificationStore(s => s.markRead);
  const kind = kindOf(n.type);
  const urgent = URGENT.has(n.type);
  const life = urgent ? URGENT_TOAST_MS : TOAST_MS;

  // 멈추면 흐른 만큼 빼 두고 다시 갈 때 남은 만큼만 기다린다.
  const [paused, setPaused] = useState(false);
  const left = useRef(life);
  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const id = window.setTimeout(onClose, left.current);
    return () => {
      window.clearTimeout(id);
      left.current -= Date.now() - startedAt;
    };
  }, [paused, onClose]);

  const open = () => {
    onClose();
    // 읽음 처리가 성공했을 때만 줄인다. 감소는 스토어가 맡아 중복 감소를 막는다.
    if (!n.isRead) {
      markAsRead(n.id)
        .then(res => markRead(n.id, res?.unreadCount))
        .catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  return (
    <motion.div
      data-testid="notification-toast"
      initial={{ opacity: 0, x: 32, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 32, transition: { duration: 0.16 } }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={e => {
        // 카드 안의 다른 버튼으로 옮겨 갈 때는 계속 멈춰 있다
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/30"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${kind.accent}`} />
      <button
        type="button"
        onClick={open}
        className="flex w-full items-start gap-3 py-3.5 pl-5 pr-10 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:hover:bg-slate-700/40"
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${kind.bg} ${kind.color} ${
            urgent ? 'animate-attackIn' : ''
          }`}
        >
          {kind.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {kind.title}
            {more > 0 && <span className="badge badge-gray tabular-nums">외 {more}건</span>}
          </span>
          <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {n.message}
          </span>
          {n.link && (
            <span className="mt-1 inline-flex items-center text-2xs font-medium text-primary-600 dark:text-primary-400">
              바로 가기
              <ChevronRight className="h-3 w-3" />
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="알림 닫기"
        className="absolute right-2 top-2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
      >
        <X className="h-4 w-4" />
      </button>
      {/* 남은 시간. 움직임 줄이기에서는 애니메이션이 바로 끝나므로 감춘다. */}
      <span
        aria-hidden
        data-testid="toast-life"
        className={`absolute bottom-0 left-0 h-0.5 w-full origin-left opacity-70 animate-toastLife motion-reduce:hidden ${kind.accent}`}
        style={{
          animationDuration: `${life}ms`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </motion.div>
  );
}

export function NotificationToast() {
  const { newNotification, clearNew } = useRealtimeNotifications();
  const more = useNotificationStore(s => s.toastMore);
  // 종 목록을 열어 둔 동안에는 팝업이 목록 첫 줄을 덮으므로 띄우지 않고 비워 둔다.
  const panelOpen = useUIOverlays(s => s.activeDropdown === 'notifications');
  useEffect(() => {
    if (panelOpen && newNotification) clearNew();
  }, [panelOpen, newNotification, clearNew]);

  const show = newNotification && !panelOpen ? newNotification : null;
  // 지금 움직여야 하는 알림은 맨 위 띠로 띄운다
  const urgent = show && URGENT.has(show.type) ? show : null;

  return (
    <>
      {urgent && (
        <TopNoticeSlot priority={10}>
          <UrgentNotice key={urgent.id} n={urgent} onClose={clearNew} />
        </TopNoticeSlot>
      )}
      {/* z-toast 는 모달(z-50)보다 위여야 모달 위로 뜬다. 항상 붙어 있어 낭독기가 읽어 준다. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-20 z-toast flex justify-end sm:left-auto"
      >
        <AnimatePresence>
          {show && !urgent && (
            // 알림마다 새 카드. 남은 시간·멈춤 상태가 앞 알림에서 이어지지 않는다.
            <ToastCard key={show.id} n={show} more={more} onClose={clearNew} />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** 공격·대결처럼 지금 움직여야 하는 알림을 맨 위 띠로 보여 준다. */
function UrgentNotice({ n, onClose }: { n: Notification; onClose: () => void }) {
  const navigate = useNavigate();
  const markRead = useNotificationStore(s => s.markRead);
  const kind = kindOf(n.type);

  const open = () => {
    onClose();
    if (!n.isRead) {
      markAsRead(n.id)
        .then(res => markRead(n.id, res?.unreadCount))
        .catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  return (
    <TopNotice
      icon={n.type === 'ATTACK' ? '💥' : '⚔️'}
      title={kind.title}
      message={n.message}
      action={n.link ? '보러 가기' : undefined}
      onAction={n.link ? open : undefined}
      onClose={onClose}
      lifeMs={URGENT_TOAST_MS}
      tone={n.type === 'ATTACK' ? 'rose' : 'violet'}
    />
  );
}
