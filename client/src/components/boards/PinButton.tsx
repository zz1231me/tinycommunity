// client/src/components/boards/PinButton.tsx
// 상단 고정 토글 + 고정 기간 선택.
//
// 고정을 켤 때만 기간을 묻는다. 끌 때 기간을 묻는 것은 의미가 없고,
// 한 번의 클릭으로 끝나야 하는 동작에 단계를 더하는 일이다.

import { useEffect, useRef, useState } from 'react';
import { Pin } from 'lucide-react';
import { togglePin } from '../../api/posts';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

interface Props {
  boardType: string;
  postId: string;
  isPinned: boolean;
  /** 고정 만료 시각 (무기한이면 null) */
  pinnedUntil: string | null;
  onChange: (next: { isPinned: boolean; pinnedUntil: string | null }) => void;
}

const DURATIONS: Array<{ label: string; days: number | null }> = [
  { label: '기간 없음', days: null },
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
];

/** 만료까지 남은 날수. 하루 미만이면 0 을 돌려주고 "오늘까지" 로 표시한다. */
function daysLeft(until: string): number {
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 86_400_000));
}

export function PinButton({ boardType, postId, isPinned, pinnedUntil, onChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다 — 메뉴가 떠 있는 채로 다른 동작을 하면 상태가 헷갈린다
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const apply = async (days: number | null) => {
    setBusy(true);
    try {
      const until = days === null ? null : new Date(Date.now() + days * 86_400_000);
      const result = await togglePin(boardType, postId, until);
      onChange(result);
      setMenuOpen(false);
      window.dispatchEvent(new Event('post-updated'));
    } catch (err) {
      toast.error(getApiErrorMessage(err, '핀 설정에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const label = isPinned
    ? pinnedUntil
      ? `고정 해제 (${daysLeft(pinnedUntil) === 0 ? '오늘까지' : `${daysLeft(pinnedUntil)}일 남음`})`
      : '고정 해제'
    : '고정';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={busy}
        // 고정할 때만 기간을 고르게 하고, 해제는 한 번에 끝낸다
        onClick={() => (isPinned ? apply(null) : setMenuOpen(v => !v))}
        aria-expanded={isPinned ? undefined : menuOpen}
        aria-label={isPinned ? '고정 해제' : '게시글 고정'}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          isPinned
            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
        }`}
      >
        <Pin className="h-3.5 w-3.5" fill="currentColor" />
        {label}
      </button>

      {menuOpen && !isPinned && (
        <div
          role="menu"
          aria-label="고정 기간"
          className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {DURATIONS.map(d => (
            <button
              key={d.label}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => apply(d.days)}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
