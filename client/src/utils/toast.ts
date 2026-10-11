// 토스트 유틸리티. React 밖에서도 부를 수 있어야 해서 DOM 을 직접 다룬다.

const CONTAINER_ID = 'app-toast-container';
const ANIM_STYLE_ID = 'app-toast-animations';

function ensureContainer(): HTMLDivElement {
  let container = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (container) return container;
  container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.style.cssText = `
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
    max-width: 420px;
  `;
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('role', 'status');
  document.body.appendChild(container);
  return container;
}

const ACTION_CONTAINER_ID = 'app-toast-action-container';

/**
 * 단추가 있는 토스트(되돌리기)는 화면 아래 가운데에 띄운다. 오른쪽 위는 업무 화면의 거르기 줄을 가리고,
 * 누르려고 손을 뻗는 자리로도 멀다.
 */
function ensureActionContainer(): HTMLDivElement {
  let container = document.getElementById(ACTION_CONTAINER_ID) as HTMLDivElement | null;
  if (container) return container;
  container = document.createElement('div');
  container.id = ACTION_CONTAINER_ID;
  container.style.cssText = `
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
    max-width: calc(100vw - 2rem);
  `;
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('role', 'status');
  document.body.appendChild(container);
  return container;
}

function ensureAnimStyle(): void {
  if (document.getElementById(ANIM_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ANIM_STYLE_ID;
  style.textContent = `
    @keyframes appToastSlideIn {
      from { opacity: 0; transform: translateX(100%); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes appToastSlideOut {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(100%); }
    }
    @keyframes appToastFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes appToastFadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes appToastPopIn {
      from { opacity: 0; transform: scale(0.94); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

type ToastType = 'success' | 'error' | 'info' | 'warning';

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
};
const BG_COLORS: Record<ToastType, string> = {
  success: '#10b981',
  error: '#ef4444',
  info: '#3b82f6',
  warning: '#f59e0b',
};

/** 토스트 안의 단추 하나. '되돌리기' 처럼 방금 한 일을 바로 무를 때 쓴다. */
interface ToastAction {
  label: string;
  onClick: () => void;
}

function showBrowserToast(
  message: string,
  type: ToastType,
  durationMs = 3000,
  action?: ToastAction
): void {
  ensureAnimStyle();
  const container = action ? ensureActionContainer() : ensureContainer();
  const el = document.createElement('div');
  el.style.cssText = `
    background-color: ${BG_COLORS[type]};
    color: white;
    padding: 0.75rem 1.25rem;
    border-radius: 0.5rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.875rem;
    animation: ${action ? 'appToastFadeIn' : 'appToastSlideIn'} 0.25s ease-out;
    pointer-events: auto;
  `;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');

  // innerHTML 대신 textContent 로 구성한다(XSS 방지)
  const iconSpan = document.createElement('span');
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.textContent = ICONS[type];
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  el.appendChild(iconSpan);
  el.appendChild(msgSpan);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.style.animation = `${action ? 'appToastFadeOut' : 'appToastSlideOut'} 0.25s ease-out`;
    setTimeout(() => {
      el.parentNode?.removeChild(el);
    }, 250);
  };

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action.label;
    btn.style.cssText = `
      margin-left: 0.5rem; padding: 0.25rem 0.625rem;
      background: rgba(255, 255, 255, 0.2); color: white;
      border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 0.375rem;
      font-size: 0.8125rem; font-weight: 600; cursor: pointer;
    `;
    btn.addEventListener('click', e => {
      // 토스트를 눌러 닫는 동작과 겹치지 않게 한다. 한 번만 무른다.
      e.stopPropagation();
      if (removed) return;
      action.onClick();
      remove();
    });
    el.appendChild(btn);
  }

  container.appendChild(el);
  setTimeout(remove, durationMs);

  el.addEventListener('click', remove);
}

const CENTER_ERROR_ID = 'app-center-error';
// 떠 있는 중앙 오류 팝업의 정리 함수. 교체할 때 반드시 불러야 리스너·타이머가 남지 않는다.
let closeActiveError: ((immediate?: boolean) => void) | null = null;

// 오류만 화면 중앙에 크게 띄운다. 성공·정보·경고는 코너 토스트를 쓴다.
function showCenterError(message: string, durationMs = 6000): void {
  ensureAnimStyle();
  // 한 번에 하나만 띄운다. 기존 팝업을 리스너·타이머까지 정리한다.
  closeActiveError?.(true);

  const dark = document.documentElement.classList.contains('dark');
  const prevFocus = document.activeElement as HTMLElement | null;

  const backdrop = document.createElement('div');
  backdrop.id = CENTER_ERROR_ID;
  backdrop.style.cssText = `
    position: fixed; inset: 0; z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
    animation: appToastFadeIn 0.15s ease-out;
  `;

  const card = document.createElement('div');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  card.style.cssText = `
    width: 100%; max-width: 340px;
    background: ${dark ? '#1e293b' : '#ffffff'};
    border: 1px solid ${dark ? '#334155' : '#e2e8f0'};
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.25);
    padding: 1.5rem 1.5rem 1.25rem;
    text-align: center;
    font-family: system-ui, -apple-system, sans-serif;
    animation: appToastPopIn 0.18s ease-out;
  `;

  const icon = document.createElement('div');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '!';
  icon.style.cssText = `
    width: 48px; height: 48px; margin: 0 auto 0.875rem;
    border-radius: 9999px;
    background: ${dark ? 'rgba(239,68,68,0.15)' : '#fef2f2'};
    color: #ef4444;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 700; line-height: 1;
  `;

  const msg = document.createElement('p');
  msg.textContent = message;
  msg.style.cssText = `
    margin: 0 0 1.25rem;
    font-size: 0.9375rem; line-height: 1.5;
    color: ${dark ? '#f1f5f9' : '#1e293b'};
    word-break: keep-all;
  `;

  const btn = document.createElement('button');
  btn.textContent = '확인';
  btn.style.cssText = `
    width: 100%; padding: 0.625rem 1rem;
    background: #ef4444; color: white;
    border: none; border-radius: 0.5rem;
    font-size: 0.875rem; font-weight: 600; cursor: pointer;
  `;

  card.appendChild(icon);
  card.appendChild(msg);
  card.appendChild(btn);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  btn.focus();

  let timer = 0;
  const close = (immediate = false) => {
    if (!backdrop.parentNode) return;
    window.clearTimeout(timer);
    document.removeEventListener('keydown', onKey, true);
    closeActiveError = null;
    if (immediate) {
      backdrop.remove(); // 교체 시에는 애니메이션 없이 즉시 제거한다
      return;
    }
    backdrop.style.animation = 'appToastFadeOut 0.15s ease-out';
    setTimeout(() => backdrop.remove(), 150);
    prevFocus?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // ESC 를 여기서 잡지 않으면 뒤에 열린 대화상자까지 함께 닫힌다.
    e.stopImmediatePropagation();
    close();
  };

  btn.addEventListener('click', () => close());
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close(); // 배경 클릭만 닫는다
  });
  document.addEventListener('keydown', onKey, true);
  timer = window.setTimeout(() => close(), durationMs);
  closeActiveError = close;
}

export const toast = {
  success: (message: string) => {
    if (import.meta.env.DEV) console.info('✅ Toast Success:', message);
    showBrowserToast(message, 'success');
  },
  error: (message: string) => {
    if (import.meta.env.DEV) console.error('❌ Toast Error:', message);
    showCenterError(message);
  },
  info: (message: string) => {
    if (import.meta.env.DEV) console.info('ℹ️ Toast Info:', message);
    showBrowserToast(message, 'info');
  },
  warning: (message: string) => {
    if (import.meta.env.DEV) console.warn('⚠️ Toast Warning:', message);
    showBrowserToast(message, 'warning');
  },
  /** 방금 한 일을 알리고 몇 초 동안 '되돌리기' 를 준다. 묻는 확인창보다 흐름을 덜 끊는다. */
  undo: (message: string, onUndo: () => void, durationMs = 6000) => {
    showBrowserToast(message, 'info', durationMs, { label: '되돌리기', onClick: onUndo });
  },
};
