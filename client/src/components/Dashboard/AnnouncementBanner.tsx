// client/src/components/Dashboard/AnnouncementBanner.tsx
// 대시보드 상단 공지 배너 — 현재 게시 중인 공지를 표시, 개별 닫기(로컬 기억).
import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { fetchActiveAnnouncements, type Announcement } from '../../api/announcements';
import { useAuth } from '../../store/auth';

const DISMISS_KEY = 'dismissedAnnouncements';

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function AnnouncementBanner() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => readDismissed());

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    fetchActiveAnnouncements()
      .then(a => alive && setItems(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  // 공지가 수정되면(updatedAt 변경) 닫힘을 무시하고 다시 노출하기 위해 updatedAt을 키로 함께 저장
  const dismiss = (a: Announcement) => {
    const next = { ...dismissed, [a.id]: a.updatedAt || '1' };
    setDismissed(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  };

  const visible = items.filter(a => dismissed[a.id] !== (a.updatedAt || '1'));
  if (visible.length === 0) return null;

  return (
    <div className="flex-shrink-0 space-y-2 px-4 pt-4 sm:px-6">
      {visible.map(a => (
        <div
          key={a.id}
          className="flex items-start gap-3 rounded-xl border border-secondary-200/70 bg-secondary-50 px-4 py-3 dark:border-secondary-900/50 dark:bg-secondary-900/20"
        >
          <Megaphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-secondary-600 dark:text-secondary-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{a.title}</p>
            {a.content && (
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                {a.content}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(a)}
            aria-label="공지 닫기"
            className="flex-shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-secondary-100 hover:text-slate-600 dark:hover:bg-secondary-900/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
