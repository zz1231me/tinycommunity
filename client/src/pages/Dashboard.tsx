// client/src/pages/Dashboard.tsx
import { useEffect } from 'react';
import { useNavigate, useLocation, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useSiteSettings } from '../store/siteSettings';
import { useUIOverlays } from '../store/uiOverlays';
import { DashboardSidebar } from '../components/Dashboard/DashboardSidebar';
import { UserDropdown } from '../components/Dashboard/UserDropdown';
import { GlobalSearch } from '../components/Dashboard/GlobalSearch';
import { NotificationBell } from '../components/Dashboard/NotificationBell';
import { CommandPalette } from '../components/common/CommandPalette';
import { useHotkeys } from 'react-hotkeys-hook';

function Dashboard() {
  const { isAuthenticated } = useAuth();
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const location = useLocation();

  // 사이드바/dropdown 통합 store — 한 번에 하나의 dropdown만 열리고
  // 사이드바 토글 시 다른 dropdown을 자동으로 닫는다 (모바일 레이어 충돌 해소).
  const sidebarOpen = useUIOverlays(s => s.sidebarOpen);
  const toggleSidebar = useUIOverlays(s => s.toggleSidebar);
  const closeSidebar = useUIOverlays(s => s.closeSidebar);
  const isCommandOpen = useUIOverlays(s => s.activeDropdown === 'commandPalette');
  const openCommand = useUIOverlays(s => s.openDropdown);
  const closeCommand = useUIOverlays(s => s.closeDropdown);

  // ⚠️ ⌘K는 GlobalSearch(콘텐츠 검색)가 점유.
  //    네비게이션 팔레트는 VSCode 컨벤션과 동일하게 ⌘⇧P / Ctrl+Shift+P로 분리.
  useHotkeys(
    'ctrl+shift+p, meta+shift+p',
    e => {
      e.preventDefault();
      openCommand('commandPalette');
    },
    { enableOnFormTags: false }
  );

  // ⚠️ /dashboard → /dashboard/calendar 리다이렉트는 App.tsx의 <Route index>가 이미 처리.
  //    여기서 또 navigate하면 마운트 직후 두 번 라우팅되어 깜빡임 발생.

  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  // 페이지 이동 시 모든 overlay 닫기 (모바일에서 메뉴 클릭 후 사이드바/dropdown 잔존 방지)
  const closeAll = useUIOverlays(s => s.closeAll);
  useEffect(() => {
    closeAll();
  }, [location.pathname, closeAll]);

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* 헤더 */}
      <header
        className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800
                         flex items-center px-3 sm:px-5 z-50 flex-shrink-0"
      >
        <div className="w-full flex items-center justify-between gap-3">
          {/* 왼쪽 — 햄버거 + 로고 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 모바일 메뉴 버튼 */}
            <button
              onClick={() => toggleSidebar()}
              className="p-2 text-slate-500 dark:text-slate-400
                         hover:bg-slate-100 dark:hover:bg-slate-800
                         rounded-lg transition-colors lg:hidden"
              aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={sidebarOpen}
              aria-controls="dashboard-sidebar"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            {/* 로고 */}
            <Link
              to="/dashboard"
              className="flex items-center gap-2.5 hover:opacity-75 transition-opacity"
              title={`${settings.siteName} 홈으로 이동`}
            >
              {settings.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt={settings.siteName}
                  className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700
                                flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary-500/30"
                >
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
              )}
              <span className="hidden sm:block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-40">
                {settings.siteName}
              </span>
            </Link>
          </div>

          {/* 중앙 — 글로벌 검색 */}
          <GlobalSearch />

          {/* 오른쪽 — 알림 + 유저 드롭다운 */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <NotificationBell />
            <UserDropdown />
          </div>
        </div>
      </header>

      {/* 바디 */}
      <div className="flex flex-1 min-h-0">
        <DashboardSidebar isOpen={sidebarOpen} onClose={closeSidebar} />

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 dark:bg-slate-900">
          <Outlet />
        </main>
      </div>

      {/* 모바일 사이드바 백드롭 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-30 transition-opacity lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <CommandPalette
        open={isCommandOpen}
        onOpenChange={open => {
          if (open) openCommand('commandPalette');
          else closeCommand('commandPalette');
        }}
      />
    </div>
  );
}

export default Dashboard;
