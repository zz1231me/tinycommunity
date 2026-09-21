// client/src/components/common/NotificationToast.tsx
// 새 알림이 오면 헤더 아래 오른쪽에 잠깐 뜨는 팝업.
//
// 예전 것은 어떤 알림이든 🔔 '새 알림' 한 가지 얼굴에 내용은 한 줄로 잘렸고, 눌러도
// 아무 데도 가지 않아 결국 종을 열어 다시 찾아야 했다. 읽는 중에도 5초면 사라졌다.
//  - 종류마다 아이콘·제목·색 (종 목록과 같은 표 — notificationKinds)
//  - 누르면 읽음으로 하고 그 알림의 자리로 간다
//  - 마우스를 올리거나 키보드로 들어오면 멈춘다. 남은 시간은 아래 막대로 보인다
//  - 공격·대결은 받는 사람이 움직여야 하는 알림이라, 더 오래 두고 화면 맨 위를
//    가로지르는 띠로 띄운다(구석 카드로는 눈에 잘 걸리지 않는다고 했다)
//  - 그사이 함께 온 알림이 있으면 '외 N건'

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
/** 받는 사람이 곧 움직여야 하는 알림 — 공격은 1분이면 끝나고, 대결은 답을 기다린다 */
export const URGENT_TOAST_MS = 10_000;
const URGENT = new Set<Notification['type']>(['ATTACK', 'DUEL']);

function ToastCard({ n, more, onClose }: { n: Notification; more: number; onClose: () => void }) {
  const navigate = useNavigate();
  const markRead = useNotificationStore(s => s.markRead);
  const kind = kindOf(n.type);
  const urgent = URGENT.has(n.type);
  const life = urgent ? URGENT_TOAST_MS : TOAST_MS;

  // 멈추면 흐른 만큼 빼 두고, 다시 가면 남은 만큼만 기다린다 —
  // 멈췄다 풀 때마다 처음부터 다시 세면 마우스를 스치기만 해도 끝없이 남는다.
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
    // 읽음 처리가 성공했을 때만 종 숫자를 줄인다 — 실패했는데 줄이면 숫자가 거짓말을 한다.
    // 줄이는 일은 스토어(markRead)가 맡는다 — 같은 알림을 종 목록에서 또 읽어도 한 번만 준다.
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
        // 카드 안의 다른 단추로 옮겨 갈 때는 계속 멈춰 있다
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
            {more > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-px text-2xs font-medium tabular-nums text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                외 {more}건
              </span>
            )}
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
      {/* 남은 시간. 움직임 줄이기에서는 애니메이션이 곧바로 끝나 '다 됐다' 로 읽히므로 감춘다 */}
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
  // 종 목록을 열어 둔 동안에는 띄우지 않는다.
  //
  // 둘 다 헤더 오른쪽 아래에 뜨는데 팝업이 더 위층(z-toast 80 > 드롭다운 70)이라, 목록을
  // 보고 있으면 새 알림이 목록 첫 줄을 덮었다 — 그 줄은 목록이 방금 맨 위에 붙인 바로 그
  // 알림이다. 목록이 이미 보여 주므로 팝업은 접어 두고, 접는 김에 비워 둔다(목록을 닫은
  // 뒤에 뒤늦게 튀어나오지 않게).
  const panelOpen = useUIOverlays(s => s.activeDropdown === 'notifications');
  useEffect(() => {
    if (panelOpen && newNotification) clearNew();
  }, [panelOpen, newNotification, clearNew]);

  const show = newNotification && !panelOpen ? newNotification : null;
  // 지금 움직여야 하는 알림은 맨 위 띠로 — 구석 카드는 놓치기 쉽다
  const urgent = show && URGENT.has(show.type) ? show : null;

  return (
    <>
      {urgent && (
        <TopNoticeSlot>
          <UrgentNotice key={urgent.id} n={urgent} onClose={clearNew} />
        </TopNoticeSlot>
      )}
      {/* z-toast: 모달(z-50)보다 위. 같은 값이면 App.tsx 위쪽에서 렌더되는 탓에
          라우트 안쪽 모달에 덮여, 모달을 열어 둔 동안 온 알림이 보이지 않는다.
          늘 붙어 있는 알림 영역 — 화면 낭독기가 새로 들어온 내용을 읽어 준다. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-20 z-toast flex justify-end sm:left-auto"
      >
        <AnimatePresence>
          {show && !urgent && (
            // 알림마다 새 카드 — 남은 시간·멈춤 상태가 앞 알림에서 이어지지 않는다
            <ToastCard key={show.id} n={show} more={more} onClose={clearNew} />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** 공격·대결처럼 지금 움직여야 하는 알림 — 맨 위를 가로지르는 띠 */
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
