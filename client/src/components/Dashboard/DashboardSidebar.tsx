// client/src/components/Dashboard/DashboardSidebar.tsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Pencil, BookOpen, Settings, Folder, Link } from 'lucide-react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { SidebarNav } from './SidebarNav';
import { BoardIcon } from './BoardIcon';
import { useAccessibleBoards } from '../../hooks/useAccessibleBoards';
import { useBookmarks } from '../../hooks/useBookmarks';
import { useAuth } from '../../store/auth';
import { logger } from '../../utils/logger';

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// 섹션 헤더
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 mb-2 text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wide select-none">
      {children}
    </p>
  );
}

// 인라인 스피너
function Spinner() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 dark:text-slate-500">
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

  const isAdminActive = location.pathname.startsWith('/admin');

  return (
    <aside
      className={`
      w-60 bg-white dark:bg-slate-900
      border-r border-slate-200 dark:border-slate-800
      lg:relative fixed z-40
      top-14 lg:top-0 bottom-0 left-0
      transform transition-transform duration-250 ease-in-out
      ${isOpen ? 'translate-x-0 shadow-2xl shadow-slate-900/20' : '-translate-x-full lg:translate-x-0'}
    `}
    >
      <SimpleBar className="h-full overscroll-contain" autoHide={false}>
        <nav className="p-3 space-y-5 pt-4">
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
                className="mx-3 px-3 py-3 text-sm text-slate-500 dark:text-slate-500
                            bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/60
                            text-center leading-relaxed"
              >
                접근 가능한
                <br />
                게시판이 없습니다
              </p>
            </div>
          )}

          {/* 개인 공간 */}
          {!boardsLoading && personalBoards.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 mb-1.5">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide select-none flex items-center gap-1.5">
                  <Folder className="w-3 h-3" />
                  개인 공간
                </p>
                <span
                  className="text-xs font-semibold text-amber-700 dark:text-amber-500
                                 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full
                                 border border-amber-200 dark:border-amber-800/40"
                >
                  나만
                </span>
              </div>
              <div className="space-y-0.5">
                {personalBoards.map(board => (
                  <SidebarNav
                    key={board.id}
                    label={board.name}
                    to={`posts/${board.id}`}
                    closeSidebar={onClose}
                    icon={<Folder className="w-4.5 h-4.5 text-amber-500" />}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 도구 */}
          <div>
            <SectionLabel>도구</SectionLabel>
            <div className="space-y-0.5">
              <SidebarNav
                label="메모"
                to="memos"
                closeSidebar={onClose}
                icon={<Pencil className="w-4.5 h-4.5" />}
              />
              <SidebarNav
                label="위키"
                to="wiki"
                closeSidebar={onClose}
                icon={<BookOpen className="w-4.5 h-4.5" />}
              />
            </div>
          </div>

          {/* 관리자 패널 */}
          {isAdmin && (
            <div>
              <SectionLabel>관리</SectionLabel>
              <div className="space-y-0.5">
                <button
                  onClick={handleAdminClick}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
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
                    className={`flex-shrink-0 transition-colors ${isAdminActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'}`}
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
              <p className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wide select-none">
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
                <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-500">
                  저장된 북마크가 없습니다
                </p>
              ) : (
                bookmarks.slice(0, 8).map(bookmark => (
                  <button
                    key={bookmark.id}
                    onClick={() => openBookmark(bookmark.url)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-base
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
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                DEV
              </p>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 space-y-0.5 font-mono">
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
