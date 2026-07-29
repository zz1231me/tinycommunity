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

const SEEN_KEY = 'recentPostsLastSeen'; // 마지막으로 확인한 최신글 시각(ISO)

export function RecentPostsMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false); // 안 읽은 새 글 존재 여부(빨간 점)
  const ref = useRef<HTMLDivElement>(null);

  // 가장 최신 글이 '마지막 확인 시각'보다 새로우면 안 읽은 새 글이 있는 것
  const computeHasNew = (list: RecentPost[]) => {
    if (list.length === 0) return false;
    const seen = localStorage.getItem(SEEN_KEY);
    return !seen || new Date(list[0].createdAt).getTime() > new Date(seen).getTime();
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchRecentPosts();
      setPosts(list);
      // 읽으면 localStorage에 최신글 시각이 저장돼 computeHasNew가 자동으로 false가 된다.
      setHasNew(computeHasNew(list));
    } catch {
      /* 헤더 보조 기능 — 조용히 무시 */
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트 + 2분 주기로 새 글 확인(빨간 점 갱신)
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 120_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // 열면 '읽음' 처리 → 최신글 시각 저장, 빨간 점 제거
      const list = await fetchRecentPosts().catch(() => posts);
      setPosts(list);
      if (list.length > 0) localStorage.setItem(SEEN_KEY, list[0].createdAt);
      setHasNew(false);
    }
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
        aria-label={hasNew ? '최신 게시물 (새 글 있음)' : '최신 게시물'}
        title={hasNew ? '새 게시물이 있습니다' : '최신 게시물'}
        aria-expanded={open}
        className="relative p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <Newspaper className="w-5 h-5" />
        {hasNew && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}
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
