// client/src/components/Dashboard/RecentPostsMenu.tsx
// 헤더 — 접근 가능한 게시판들의 '최신 소식'. 확인 안 한 글을 순서대로(최신순) 강조해 보여준다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, Lock, Circle } from 'lucide-react';
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
  const [tick, setTick] = useState(0); // 안 읽은 제목 회전 인덱스(헤더 인라인 프리뷰)
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

  // 마운트 + 2분 주기 + 창 포커스 시 갱신 (다른 곳에서 글을 읽고 오면 카운트 반영)
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 120_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // 안 읽은 글이 여러 개면 제목을 4초마다 차근차근 회전(헤더 인라인 프리뷰)
  useEffect(() => {
    const n = posts.filter(p => !p.isRead).length;
    if (n <= 1) {
      setTick(0);
      return;
    }
    const t = setInterval(() => setTick(v => v + 1), 4000);
    return () => clearInterval(t);
  }, [posts]);

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
    // 낙관적 읽음 처리 — 클릭 즉시 배지에서 빠지도록
    setPosts(prev => prev.map(x => (x.id === p.id ? { ...x, isRead: true } : x)));
    navigate(`/dashboard/posts/${p.boardType}/${p.id}`);
  };

  const unread = posts.filter(p => !p.isRead);
  const unreadCount = unread.length;
  // 안 읽은 글을 위로(최신순), 그 아래 읽은 글 — "순서대로 차근차근"
  const ordered = [...unread, ...posts.filter(p => p.isRead)];
  // 헤더에 미리 보여줄 현재 회전 대상 제목(안 읽은 글 중)
  const preview = unreadCount > 0 ? unread[tick % unreadCount] : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        aria-label={unreadCount > 0 ? `최신 소식 (안 읽음 ${unreadCount})` : '최신 소식'}
        title={preview ? preview.title : '최신 소식'}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ${
          preview ? 'py-1.5 pl-2 pr-2' : 'p-2'
        }`}
      >
        <Newspaper className="h-5 w-5 flex-shrink-0" />
        {/* 안 읽은 최신 제목 인라인 프리뷰 (넓은 화면에서만, 회전) */}
        {preview && (
          <span
            key={preview.id}
            className="hidden max-w-[9rem] truncate text-xs font-medium text-slate-600 dark:text-slate-300 animate-fadeIn lg:block"
          >
            {preview.title}
          </span>
        )}
        {unreadCount > 0 && (
          <span
            className="flex-shrink-0 rounded-full bg-red-500 px-1.5 text-[0.65rem] font-bold leading-[1.05rem] text-white animate-pulse"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-800 z-50 animate-scaleIn overflow-hidden"
          role="menu"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <span className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-secondary-600" />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                최신 소식
              </span>
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                안 읽음 {unreadCount}
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto py-1">
            {loading && posts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">불러오는 중…</div>
            ) : posts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                최근 게시물이 없습니다.
              </div>
            ) : (
              ordered.map(p => (
                <button
                  key={`${p.boardType}-${p.id}`}
                  onClick={() => go(p)}
                  role="menuitem"
                  className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                    p.isRead ? 'opacity-60' : ''
                  }`}
                >
                  {/* 안 읽음 표시 점 — 읽은 글은 자리만 차지해 정렬 유지 */}
                  <span className="mt-1.5 flex-shrink-0" aria-hidden="true">
                    {p.isRead ? (
                      <Circle className="h-2 w-2 text-transparent" />
                    ) : (
                      <span className="block h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm text-slate-800 dark:text-slate-100">
                      {p.isSecret && <Lock className="h-3 w-3 flex-shrink-0 text-slate-400" />}
                      <span className={`truncate ${p.isRead ? 'font-normal' : 'font-semibold'}`}>
                        {p.title}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                      <span className="truncate">{p.boardName}</span>
                      <span>·</span>
                      <span className="flex-shrink-0">{p.authorName}</span>
                      <span>·</span>
                      <span className="flex-shrink-0">{ago(p.createdAt)}</span>
                    </span>
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
