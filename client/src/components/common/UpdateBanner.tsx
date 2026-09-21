// client/src/components/common/UpdateBanner.tsx
// 새 배포가 떴을 때 알리고, 안전한 순간에 스스로 새로고침한다.
//
// 열어 둔 탭은 배포를 알아채지 못한다. 예전에는 사람들이 며칠째 예전 화면을 쓰다가
// 고쳐 둔 문제를 다시 겪었고, 강제로 다시 받게 하려면 Ctrl+Shift+R 을 알려 줘야 했다.
//
// 다만 아무 때나 새로고침하면 쓰던 것이 날아간다. 그래서:
//  · 글을 쓰는 중(입력칸에 손이 가 있음)이거나 대화상자가 열려 있으면 기다린다
//  · 그 밖에는 잠깐 알린 뒤 스스로 새로고침한다
//  · 다른 탭을 보고 있는 동안이면 그때 바로 — 돌아오면 이미 새 화면이다

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useNewBuildAvailable } from '../../hooks/useAppVersion';
import { hasOpenDialog } from '../../hooks/useFocusTrap';

/** 지금 새로고침하면 쓰던 것이 날아가는가 */
function busyRightNow(): boolean {
  if (hasOpenDialog()) return true;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** 알린 뒤 스스로 새로고침하기까지 */
const GRACE_MS = 20_000;

export function UpdateBanner() {
  const stale = useNewBuildAvailable();
  const [visible, setVisible] = useState(false);
  const reloading = useRef(false);

  useEffect(() => {
    if (!stale) return;
    setVisible(true);

    const reload = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };

    // 보고 있지 않은 탭이면 지금이 가장 안전하다 — 돌아오면 이미 새 화면이다
    if (document.hidden) {
      reload();
      return;
    }

    const id = window.setInterval(() => {
      if (document.hidden || !busyRightNow()) reload();
    }, GRACE_MS);
    return () => window.clearInterval(id);
  }, [stale]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-toast flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-primary-600 px-4 py-2 text-center text-sm font-medium text-white shadow"
    >
      <span>새 버전이 있습니다. 잠시 뒤 자동으로 새로고침됩니다.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/30"
      >
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        지금 새로고침
      </button>
    </div>
  );
}
