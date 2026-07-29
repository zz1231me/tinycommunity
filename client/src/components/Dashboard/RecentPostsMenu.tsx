// client/src/components/Dashboard/RecentPostsMenu.tsx
// 헤더 — 접근 가능한 게시판들의 '최신 게시물' 드롭다운.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, Lock } from 'lucide-react';
import { fetchRecentPosts, type RecentPost } from '../../api/posts';

// 간단 상대시간
function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return '방금';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function RecentPostsMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setPosts(await fetchRecentPosts());
    } catch {
      /* 헤더 보조 기능 — 조용히 무시 */
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  // 바깥 클릭 / Esc 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (p: RecentPost) => {
    setOpen(false);
    navigate(`/dashboard/posts/${p.boardType}/${p.id}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="최신 게시물"
        title="최신 게시물"
        aria-expanded={open}
        className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <Newspaper className="w-5 h-5" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-800 z-50 animate-scaleIn overflow-hidden"
          role="menu"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <Newspaper className="h-4 w-4 text-secondary-600" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">최신 게시물</span>
          </div>

          <div className="max-h-96 overflow-y-auto py-1">
            {loading && posts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">불러오는 중…</div>
            ) : posts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">최근 게시물이 없습니다.</div>
            ) : (
              posts.map(p => (
                <button
                  key={`${p.boardType}-${p.id}`}
                  onClick={() => go(p)}
                  role="menuitem"
                  className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {p.isSecret && <Lock className="h-3 w-3 flex-shrink-0 text-slate-400" />}
                    <span className="truncate">{p.title}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <span className="truncate">{p.boardName}</span>
                    <span>·</span>
                    <span className="flex-shrink-0">{p.authorName}</span>
                    <span>·</span>
                    <span className="flex-shrink-0">{ago(p.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RecentPostsMenu;
