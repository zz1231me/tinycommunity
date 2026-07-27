// client/src/utils/toast.ts
// 간단한 토스트 유틸리티 — 다수 토스트가 동시에 들어와도 세로로 스택되어 보이도록 컨테이너에서 관리.
// React 외부에서 호출 가능해야 하므로 DOM 직접 조작 패턴을 유지하되,
// 단일 컨테이너 + 자식으로 누적/제거하여 이전 토스트를 덮어쓰지 않게 한다.
//
// ⚠️ NotificationToast(헤더 아래 알림 팝업)는 top-20에 배치되어 이 toast와 겹치지 않는다.

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

  // textContent로 안전하게 구성 — innerHTML 미사용 (XSS 방지)
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

  // 사용자가 클릭하면 즉시 닫기
  el.addEventListener('click', remove);
}

export const toast = {
  success: (message: string) => {
    if (import.meta.env.DEV) console.info('✅ Toast Success:', message);
    showBrowserToast(message, 'success');
  },
  error: (message: string) => {
    if (import.meta.env.DEV) console.error('❌ Toast Error:', message);
    showBrowserToast(message, 'error', 4000);
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
