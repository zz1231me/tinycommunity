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

function showBrowserToast(message: string, type: ToastType, durationMs = 3000): void {
  ensureAnimStyle();
  const container = ensureContainer();
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
    animation: appToastSlideIn 0.25s ease-out;
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

  container.appendChild(el);

  const remove = () => {
    el.style.animation = 'appToastSlideOut 0.25s ease-out';
    setTimeout(() => {
      el.parentNode?.removeChild(el);
    }, 250);
  };
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
};
