// 헤더의 최신 소식 메뉴. 확인 안 한 글을 최신순으로 위에 놓는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Newspaper, Lock, Circle } from 'lucide-react';
import { fetchRecentPosts, type RecentPost } from '../../api/posts';
import { ListLoading, ListState } from '../common/ListState';
import { useUIOverlays } from '../../store/uiOverlays';
import { hasOpenDialog } from '../../hooks/useFocusTrap';

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
  // 다른 헤더 패널과 같은 store 를 쓴다. 따로 관리하면 다른 패널을 열어도 닫히지 않는다.
  const open = useUIOverlays(s => s.activeDropdown === 'recentPosts');
  const setOpen = useCallback((next: boolean) => {
    const state = useUIOverlays.getState();
    if (next) state.openDropdown('recentPosts');
    else state.closeDropdown('recentPosts');
  }, []);
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0); // 헤더 프리뷰 제목 회전 인덱스
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setPosts(await fetchRecentPosts());
    } catch {
      /* 헤더 보조 기능이라 실패는 무시한다 */
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트·2분 주기·창 포커스에 갱신한다.
  useEffect(() => {
    void load();
    // 보이지 않는 탭에서는 쉬고, 돌아올 때 focus 로 따라잡는다.
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 120_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // 안 읽은 글이 여럿이면 헤더 프리뷰 제목을 4초마다 돌린다
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
    const onKey = (e: KeyboardEvent) => {
      // 위에 대화상자가 떠 있으면 ESC 는 그쪽 몫이다
      if (e.key !== 'Escape' || hasOpenDialog()) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const go = (p: RecentPost) => {
    setOpen(false);
    // 클릭 즉시 배지에서 빠지도록 낙관적으로 읽음 처리한다
    setPosts(prev => prev.map(x => (x.id === p.id ? { ...x, isRead: true } : x)));
    navigate(`/dashboard/posts/${p.boardType}/${p.id}`);
  };

  const unread = posts.filter(p => !p.isRead);
  const unreadCount = unread.length;
  // 안 읽은 글을 위로, 그 아래에 읽은 글
  const ordered = [...unread, ...posts.filter(p => p.isRead)];
  // 헤더에 보여 줄 현재 회전 대상
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
        className={`flex items-center gap-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ${
          preview ? 'py-2 pl-2.5 pr-2.5' : 'p-2'
        }`}
      >
        <Newspaper className="h-6 w-6 flex-shrink-0" />
        {/* 안 읽은 최신 제목 프리뷰 */}
        {preview && (
          <span
            key={preview.id}
            className="hidden max-w-[13rem] truncate text-sm font-medium text-slate-600 dark:text-slate-300 animate-fadeIn md:block"
          >
            {preview.title}
          </span>
        )}
        {unreadCount > 0 && (
          <span
            className="badge-count animate-pulse flex-shrink-0 bg-red-500 text-white"
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
              <ListLoading />
            ) : posts.length === 0 ? (
              <ListState>최근 게시물이 없습니다.</ListState>
            ) : (
              ordered.map(p => (
                <button
                  key={`${p.boardType}-${p.id}`}
                  onClick={() => go(p)}
                  role="menuitem"
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                    p.isRead ? 'opacity-60' : ''
                  }`}
                >
                  {/* 안 읽음 점. 읽은 글은 자리만 차지해 정렬을 유지한다. */}
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
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
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
