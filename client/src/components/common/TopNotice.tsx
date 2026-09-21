// 화면 맨 위를 가로지르는 알림 띠. 즉시 대응이 필요한 알림에만 쓴다.
// 머리글(56px) 아래에 놓아야 로고·메뉴 단추를 덮지 않는다.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { prefersReducedMotion } from '../../utils/animations';

export function TopNotice({
  icon,
  title,
  message,
  action,
  onAction,
  onClose,
  /** 이 시간이 지나면 스스로 사라진다. 0 이면 남아 있는다. */
  lifeMs = 0,
  tone = 'rose',
}: {
  icon: ReactNode;
  title: string;
  message?: ReactNode;
  action?: string;
  onAction?: () => void;
  onClose: () => void;
  lifeMs?: number;
  tone?: 'rose' | 'amber' | 'violet';
}) {
  const TONE = {
    rose: 'bg-rose-600 dark:bg-rose-500',
    amber: 'bg-amber-500 dark:bg-amber-500',
    violet: 'bg-violet-600 dark:bg-violet-500',
  }[tone];

  // 마우스를 올리거나 키보드로 들어오면 타이머를 멈춘다
  const [paused, setPaused] = useState(false);
  const left = useRef(lifeMs);
  useEffect(() => {
    if (lifeMs <= 0 || paused) return;
    const startedAt = Date.now();
    const id = window.setTimeout(onClose, left.current);
    return () => {
      window.clearTimeout(id);
      left.current -= Date.now() - startedAt;
    };
  }, [lifeMs, paused, onClose]);

  return (
    <div
      role="status"
      data-testid="top-notice"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`${TONE} ${prefersReducedMotion() ? '' : 'animate-noticeDrop'} pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm text-white shadow-lg`}
    >
      <span aria-hidden className="text-lg leading-none">
        {icon}
      </span>
      <span className="font-semibold">{title}</span>
      {message && <span className="text-white/90">{message}</span>}
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/30"
        >
          {action}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="알림 닫기"
        className="ml-1 rounded-md p-1 transition-colors hover:bg-white/20"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * 띠들이 앉는 자리. 머리글(56px) 바로 아래, 화면에 하나뿐이다.
 * 띠마다 fixed 상자를 만들면 동시에 뜬 띠가 같은 자리에 겹친다.
 */
function noticeHost(): HTMLElement {
  let el = document.getElementById('top-notices');
  if (!el) {
    el = document.createElement('div');
    el.id = 'top-notices';
    el.className = 'pointer-events-none fixed inset-x-0 z-toast flex flex-col items-stretch gap-1';
    // 머리글(56px) 아래. 점검 배너가 켜져 있으면 그만큼 더 내린다 — 그 배너는 흐름 안에
    // 들어가 머리글을 밀어 내리므로, 이 자리를 그대로 두면 머리글을 덮는다.
    el.style.top = 'calc(3.5rem + var(--maintenance-bar-h, 0px))';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param priority 작을수록 위에 앉는다. 급한 알림(공격·대결)이 위로 오게 한다 —
 *   자리는 붙는 순서로 정해지므로, 먼저 떠 있던 띠 아래로 밀리면 정작 급한 것이 안 보인다.
 */
export function TopNoticeSlot({
  children,
  priority = 50,
}: {
  children: ReactNode;
  priority?: number;
}) {
  const [host] = useState(() => noticeHost());
  return createPortal(<div style={{ order: priority }}>{children}</div>, host);
}
