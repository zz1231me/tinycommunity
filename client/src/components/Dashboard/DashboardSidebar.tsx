import React, { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Calendar,
  LayoutDashboard,
  Compass,
  BookOpen,
  Bookmark,
  FileEdit,
  ClipboardList,
  MessagesSquare,
  Settings,
  Link,
  FileText,
  Folder,
} from 'lucide-react';
import { fetchPublishedPages, type CustomPageSummary } from '../../api/customPages';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { SidebarNav } from './SidebarNav';
import { BoardIcon } from './BoardIcon';
import { useSiteSettings } from '../../store/siteSettings';
import { wikiInsertIndex } from '../../utils/sidebarOrder';
import { useAccessibleBoards } from '../../hooks/useAccessibleBoards';
import { bookmarkHref, useBookmarks } from '../../hooks/useBookmarks';
import { useAuth } from '../../store/auth';
import { useFeature, useFeatures, useMenuVisible } from '../../store/features';
import { logger } from '../../utils/logger';

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 mb-2 text-2xs font-semibold uppercase tracking-[0.08em] text-slate-400 select-none">
      {children}
    </p>
  );
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
      <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      불러오는 중
    </div>
  );
}

export function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps) {
  // 좁은 화면에서 닫힌 서랍은 DOM 에 남아 Tab 이 보이지 않는 링크를 지나간다. 닫혀 있으면 꺼 둔다.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const hidden = narrow && !isOpen;

  const { boards, loading: boardsLoading, regularBoards, personalBoards } = useAccessibleBoards();
  const { bookmarks, loading: bookmarksLoading, error: bookmarksError } = useBookmarks();
  const { getUserRole, user, isAdmin: isAdminCheck } = useAuth();
  const location = useLocation();

  const userRole = getUserRole();
  // store.isAdmin()은 role==='admin' + roleInfo.isActive 까지 확인(비활성 역할 차단)
  const isAdmin = isAdminCheck();

  // 관리자가 끈 기능과 본인이 숨긴 메뉴는 빼고 보여 준다. 두 훅을 각각 호출한 뒤 합친다(|| 로 이으면 훅 순서가 어긋난다).
  const popularEnabled = useFeature('discovery.popular');
  const tagCloudEnabled = useFeature('discovery.tagCloud');
  const exploreHidden = useFeatures(s => s.hidden.includes('discovery.popular'));
  const showExplore = (popularEnabled || tagCloudEnabled) && !exploreHidden;
  // '대시보드' 는 이제 조망 화면이다(이름과 가는 곳이 같아졌다). 스위치가 없으므로 늘 보인다.
  // '일정' 은 따로 선 메뉴이고, 꺼졌거나 숨겼으면 뺀다 — 누르면 '꺼져 있음' 화면만 나왔다.
  const showCalendar = useMenuVisible('tools.calendar');
  const showWiki = useMenuVisible('tools.wiki');
  const wikiOrder = useSiteSettings(st => st.settings.wikiOrder);

  // 게시판 목록에 위키를 끼워 넣는다. 자리 규칙은 utils/sidebarOrder 에 적어 두었다.
  const navEntries = useMemo(() => {
    const entries: Array<{
      key: string;
      label: string;
      to: string;
      icon: React.ReactNode;
      task?: boolean;
    }> = regularBoards.map(board => ({
      key: board.id,
      label: board.name,
      to: `posts/${board.id}`,
      icon: <BoardIcon boardId={board.id} />,
      // 업무용 게시판은 안에 보드·간트가 있다. 표식이 없으면 공지판과 같은 모양이라
      // 들어가 보기 전에는 구별되지 않는다.
      task: !!board.taskEnabled,
    }));
    if (!showWiki) return entries;

    const at = wikiInsertIndex(
      regularBoards.map(b => b.order ?? 0),
      wikiOrder
    );
    entries.splice(at, 0, {
      key: '__wiki__',
      label: '위키',
      to: 'wiki',
      icon: <BookOpen className="w-4.5 h-4.5" />,
    });
    return entries;
  }, [regularBoards, showWiki, wikiOrder]);
  const showScraps = useMenuVisible('post.scrap');
  const showDrafts = useMenuVisible('post.drafts');
  const showTasks = useMenuVisible('post.tasks');
  const showMessages = useMenuVisible('social.dm');

  /** 사이드바의 다른 줄과 같은 규칙 — ⌘·가운데 클릭은 브라우저에 넘기고 서랍도 두드리지 않는다. */
  const handleAdminClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (window.innerWidth < 1024) onClose();
  };

  React.useEffect(() => {
    if (import.meta.env.DEV && !boardsLoading && user) {
      logger.debug(
        `[Sidebar] ${user.name}(${userRole}) — 일반 ${regularBoards.length}개, 개인 ${personalBoards.length}개`
      );
    }
  }, [boards, boardsLoading, user, userRole, regularBoards.length, personalBoards.length]);

  // 게시된 커스텀 HTML 페이지를 사이드바에 노출한다.
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
      inert={hidden}
      aria-hidden={hidden}
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
                to="overview"
                closeSidebar={onClose}
                icon={<LayoutDashboard className="w-4.5 h-4.5" />}
              />
              {showCalendar && (
                <SidebarNav
                  label="일정"
                  to="calendar"
                  closeSidebar={onClose}
                  icon={<Calendar className="w-4.5 h-4.5" />}
                />
              )}
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

          {/* 게시판. 위키도 여기에 끼워 관리자가 정한 순서대로 늘어놓는다 */}
          {(boardsLoading || navEntries.length > 0) && (
            <div>
              <SectionLabel>게시판</SectionLabel>
              <div className="space-y-0.5">
                {boardsLoading ? (
                  <Spinner />
                ) : (
                  navEntries.map(entry => (
                    <SidebarNav
                      key={entry.key}
                      label={entry.label}
                      to={entry.to}
                      icon={entry.icon}
                      closeSidebar={onClose}
                      trailing={
                        entry.task && showTasks ? (
                          <>
                            <span className="sr-only">업무 게시판</span>
                            <ClipboardList
                              aria-hidden="true"
                              className="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                            />
                          </>
                        ) : undefined
                      }
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* 접근 가능 게시판 없음 */}
          {!boardsLoading && navEntries.length === 0 && (
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

          {/* 도구. 여기 있는 것은 모두 '내 것' 이라 개인 공간도 같은 묶음에 둔다 —
              프로필 드롭다운에만 있으면 접힌 메뉴 안에 숨어 찾지 못한다. */}
          <div>
            <SectionLabel>도구</SectionLabel>
            <div className="space-y-0.5">
              {/* 보통 사용자당 하나다. 드롭다운과 같은 곳으로 간다. */}
              {personalBoards.length > 0 && (
                <SidebarNav
                  label="내 공간"
                  to={`posts/${personalBoards[0].id}`}
                  closeSidebar={onClose}
                  icon={<Folder className="h-4.5 w-4.5 text-amber-500" />}
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
                  label="업무"
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
                <RouterLink
                  to="/admin"
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
                </RouterLink>
              </div>
            </div>
          )}

          {/* 북마크 */}
          <div>
            <div className="flex items-center justify-between px-3 mb-1.5">
              {/* SectionLabel 과 같은 글자 규칙. 이 줄만 오른쪽 버튼이 함께 놓여 바깥 여백을 부모가 정한다 */}
              <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-slate-400 select-none">
                북마크
              </p>
              {isAdmin && (
                <RouterLink
                  to="/admin"
                  onClick={handleAdminClick}
                  className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 transition-colors"
                >
                  관리
                </RouterLink>
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
                  // 바깥 주소라 늘 새 탭이다. button + window.open 이던 때는 주소가 없어
                  // 어디로 가는지 미리 볼 수도, 링크를 복사할 수도 없었다.
                  <a
                    key={bookmark.id}
                    href={bookmarkHref(bookmark.url)}
                    target="_blank"
                    rel="noopener noreferrer"
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
                  </a>
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
