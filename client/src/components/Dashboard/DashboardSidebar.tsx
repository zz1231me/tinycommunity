// client/src/components/Dashboard/DashboardSidebar.tsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Calendar,
  Compass,
  Pencil,
  BookOpen,
  Bookmark,
  FileEdit,
  ClipboardList,
  MessagesSquare,
  Settings,
  Link,
  FileText,
} from 'lucide-react';
import { fetchPublishedPages, type CustomPageSummary } from '../../api/customPages';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { SidebarNav } from './SidebarNav';
import { BoardIcon } from './BoardIcon';
import { useAccessibleBoards } from '../../hooks/useAccessibleBoards';
import { useBookmarks } from '../../hooks/useBookmarks';
import { useAuth } from '../../store/auth';
import { useFeature } from '../../store/features';
import { logger } from '../../utils/logger';

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// 섹션 헤더
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 mb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-slate-400 select-none">
      {children}
    </p>
  );
}

// 인라인 스피너
function Spinner() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
      <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      불러오는 중
    </div>
  );
}

export function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps) {
  const { boards, loading: boardsLoading, regularBoards, personalBoards } = useAccessibleBoards();
  const {
    bookmarks,
    loading: bookmarksLoading,
    error: bookmarksError,
    openBookmark,
  } = useBookmarks();
  const { getUserRole, user, isAdmin: isAdminCheck } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const userRole = getUserRole();
  // store.isAdmin()은 role==='admin' + roleInfo.isActive 까지 확인(비활성 역할 차단)
  const isAdmin = isAdminCheck();

  // 관리자가 끈 기능은 메뉴에서도 뺀다. 눌러 봐야 403 이 뜨는 항목을 남겨 둘 이유가 없다.
  // 탐색은 인기글·태그 클라우드 중 하나라도 살아 있으면 보여 준다.
  // 두 훅을 먼저 각각 호출한 뒤 합친다 — || 로 이으면 단축 평가 때문에
  // 두 번째 훅이 렌더마다 호출되지 않아 훅 순서가 어긋난다.
  const popularEnabled = useFeature('discovery.popular');
  const tagCloudEnabled = useFeature('discovery.tagCloud');
  const showExplore = popularEnabled || tagCloudEnabled;
  const showMemo = useFeature('tools.memo');
  const showWiki = useFeature('tools.wiki');
  const showScraps = useFeature('post.scrap');
  const showDrafts = useFeature('post.drafts');
  const showTasks = useFeature('post.tasks');
  const showMessages = useFeature('social.dm');

  const handleAdminClick = () => {
    navigate('/admin');
    if (window.innerWidth < 1024) onClose();
  };

  const handleBookmarkManagementClick = () => {
    navigate('/admin');
    if (window.innerWidth < 1024) onClose();
  };

  React.useEffect(() => {
    if (import.meta.env.DEV && !boardsLoading && user) {
      logger.debug(
        `[Sidebar] ${user.name}(${userRole}) — 일반 ${regularBoards.length}개, 개인 ${personalBoards.length}개`
      );
    }
  }, [boards, boardsLoading, user, userRole, regularBoards.length, personalBoards.length]);

  // 게시된 커스텀 HTML 페이지(관리자 작성) — 사이드바에 노출
  const [customPages, setCustomPages] = React.useState<CustomPageSummary[]>([]);
  React.useEffect(() => {
    if (!user) return;
    let alive = true;
    fetchPublishedPages()
      .then(p => alive && setCustomPages(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);

  const isAdminActive = location.pathname.startsWith('/admin');

  return (
    <aside
      className={`
      w-60 bg-white dark:bg-slate-900
      border-r border-slate-200 dark:border-slate-700/70
      lg:relative fixed z-40
      top-14 lg:top-0 bottom-0 left-0
      transform transition-transform duration-250 ease-in-out
      ${isOpen ? 'translate-x-0 shadow-2xl shadow-slate-900/20' : '-translate-x-full lg:translate-x-0'}
    `}
    >
      <SimpleBar className="h-full overscroll-contain" autoHide={false}>
        <nav className="p-3 pt-4 [&>div+div]:mt-5 [&>div+div]:border-t [&>div+div]:border-slate-200/60 dark:[&>div+div]:border-slate-800/70 [&>div+div]:pt-5">
          {/* 메인 */}
          <div>
            <SectionLabel>메인</SectionLabel>
            <div className="space-y-0.5">
              <SidebarNav
                label="대시보드"
                to="calendar"
                closeSidebar={onClose}
                icon={<Calendar className="w-4.5 h-4.5" />}
              />
              {showExplore && (
                <SidebarNav
                  label="탐색"
                  to="explore"
                  closeSidebar={onClose}
                  icon={<Compass className="w-4.5 h-4.5" />}
                />
              )}
            </div>
          </div>

          {/* 게시판 */}
          {(boardsLoading || regularBoards.length > 0) && (
            <div>
              <SectionLabel>게시판</SectionLabel>
              <div className="space-y-0.5">
                {boardsLoading ? (
                  <Spinner />
                ) : (
                  regularBoards.map(board => (
                    <SidebarNav
                      key={board.id}
                      label={board.name}
                      to={`posts/${board.id}`}
                      icon={<BoardIcon boardId={board.id} />}
                      closeSidebar={onClose}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* 접근 가능 게시판 없음 */}
          {!boardsLoading && regularBoards.length === 0 && (
            <div>
              <SectionLabel>게시판</SectionLabel>
              <p
                className="mx-3 px-3 py-3 text-sm text-slate-500 dark:text-slate-400
                            bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60
                            text-center leading-relaxed"
              >
                접근 가능한
                <br />
                게시판이 없습니다
              </p>
            </div>
          )}

          {/* 개인 공간은 프로필 드롭다운(헤더)에서 진입 — 사이드바 중복 노출 제거 */}

          {/* 도구 */}
          <div>
            <SectionLabel>도구</SectionLabel>
            <div className="space-y-0.5">
              {showMemo && (
                <SidebarNav
                  label="메모"
                  to="memos"
                  closeSidebar={onClose}
                  icon={<Pencil className="w-4.5 h-4.5" />}
                />
              )}
              {showWiki && (
                <SidebarNav
                  label="위키"
                  to="wiki"
                  closeSidebar={onClose}
                  icon={<BookOpen className="w-4.5 h-4.5" />}
                />
              )}
              {showScraps && (
                <SidebarNav
                  label="스크랩"
                  to="scraps"
                  closeSidebar={onClose}
                  icon={<Bookmark className="w-4.5 h-4.5" />}
                />
              )}
              {showDrafts && (
                <SidebarNav
                  label="임시저장"
                  to="drafts"
                  closeSidebar={onClose}
                  icon={<FileEdit className="w-4.5 h-4.5" />}
                />
              )}
              {showTasks && (
                <SidebarNav
                  label="내 업무"
                  to="tasks"
                  closeSidebar={onClose}
                  icon={<ClipboardList className="w-4.5 h-4.5" />}
                />
              )}
              {showMessages && (
                <SidebarNav
                  label="다이렉트 메시지"
                  to="messages"
                  closeSidebar={onClose}
                  icon={<MessagesSquare className="w-4.5 h-4.5" />}
                />
              )}
            </div>
          </div>

          {/* HTML 페이지 (관리자 작성, 게시된 것만) */}
          {customPages.length > 0 && (
            <div>
              <SectionLabel>페이지</SectionLabel>
              <div className="space-y-0.5">
                {customPages.map(p => (
                  <SidebarNav
                    key={p.id}
                    label={p.title}
                    to={`pages/${p.slug}`}
                    closeSidebar={onClose}
                    icon={<FileText className="w-4.5 h-4.5" />}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 관리자 패널 */}
          {isAdmin && (
            <div>
              <SectionLabel>관리</SectionLabel>
              <div className="space-y-0.5">
                <button
                  onClick={handleAdminClick}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-lg
                    text-base font-medium transition-all duration-150
                    border-l-2
                    ${
                      isAdminActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-l-primary-500 dark:border-l-primary-400'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 border-l-transparent'
                    }
                  `}
                >
                  <span
                    className={`flex-shrink-0 transition-colors ${isAdminActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`}
                  >
                    <Settings className="w-4.5 h-4.5" />
                  </span>
                  <span className="flex-1 text-left truncate">관리자 패널</span>
                  {isAdminActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 dark:bg-primary-400 flex-shrink-0" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 북마크 */}
          <div>
            <div className="flex items-center justify-between px-3 mb-1.5">
              {/* SectionLabel 과 같은 글자 규칙 — 컴포넌트를 쓰지 않는 이유는 이 줄에만
                  오른쪽 버튼이 함께 놓여 바깥 여백을 부모가 정하기 때문이다. */}
              <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-slate-400 select-none">
                북마크
              </p>
              {isAdmin && (
                <button
                  onClick={handleBookmarkManagementClick}
                  className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors"
                >
                  관리
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {bookmarksLoading ? (
                <Spinner />
              ) : bookmarksError ? (
                <p className="px-3 py-2 text-sm text-red-500 dark:text-red-400">
                  북마크를 불러오지 못했습니다
                </p>
              ) : bookmarks.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  저장된 북마크가 없습니다
                </p>
              ) : (
                bookmarks.slice(0, 8).map(bookmark => (
                  <button
                    key={bookmark.id}
                    onClick={() => openBookmark(bookmark.url)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-base
                               text-slate-700 dark:text-slate-300
                               hover:bg-slate-100 dark:hover:bg-slate-800/70
                               hover:text-slate-900 dark:hover:text-slate-100
                               transition-colors duration-150"
                  >
                    <Link className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="truncate flex-1 text-left text-base font-medium">
                      {bookmark.name}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 개발 환경 디버깅 */}
          {import.meta.env.DEV && user && (
            <div className="mt-4 px-3 py-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <p className="text-2xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 tracking-wider">
                DEV
              </p>
              <div className="text-2xs text-slate-400 space-y-0.5 font-mono">
                <div>
                  {user.name} · {userRole}
                </div>
                <div>
                  일반 {regularBoards.length} · 개인 {personalBoards.length}
                </div>
              </div>
            </div>
          )}
        </nav>
      </SimpleBar>
    </aside>
  );
}
