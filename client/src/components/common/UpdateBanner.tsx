// 새 배포를 알리고 안전한 순간에 스스로 새로고침한다.

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useNewBuildAvailable } from '../../hooks/useAppVersion';
import { hasOpenDialog } from '../../hooks/useFocusTrap';
import { TopNoticeSlot } from './TopNotice';

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
      // beforeunload 로 막히면 새로고침이 일어나지 않는다. 다음 기회에 다시 보게 풀어 둔다.
      window.setTimeout(() => {
        reloading.current = false;
      }, 2_000);
    };

    // 안 보는 탭이라도 쓰던 것이 있으면 기다린다. 입력칸에 손이 가 있거나 대화상자가
    // 열린 채 탭을 옮겼을 뿐일 수 있고, 그대로 새로고침하면 쓰던 글이 날아간다.
    // 곧바로 새로고침하지 않는다. 띠를 읽을 틈은 주고, 그 뒤로는 안전해질 때마다 시도한다.
    const id = window.setInterval(() => {
      if (!busyRightNow()) reload();
    }, GRACE_MS);
    return () => window.clearInterval(id);
  }, [stale]);

  if (!visible) return null;

  return (
    <TopNoticeSlot priority={80}>
      <div
        role="status"
        className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-primary-600 px-4 py-2 text-center text-sm font-medium text-white shadow"
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
    </TopNoticeSlot>
  );
}
