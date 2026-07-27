// client/src/pages/AdminUserPage.tsx - 디자인 일관성 개선
import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PageContainer } from '../../components/common/PageContainer';
import { scrollContentToTop } from '../../utils/scroll';
import { TabNavigation } from '../../components/admin/common/TabNavigation';
import { LoadingSpinner } from '../../components/admin/common/LoadingSpinner';

// Lazy load tab components
const UserManagement = lazy(() => import('../../components/admin/tabs/UserManagement'));
const BoardManagement = lazy(() => import('../../components/admin/tabs/BoardManagement'));
const RoleManagement = lazy(() => import('../../components/admin/tabs/RoleManagement'));
const PermissionManagement = lazy(() => import('../../components/admin/tabs/PermissionManagement'));
const PasswordResetRequestManagement = lazy(
  () => import('../../components/admin/tabs/PasswordResetRequestManagement')
);
const EventManagement = lazy(() => import('../../components/admin/tabs/EventManagement'));
const BookmarkManagement = lazy(() => import('../../components/admin/tabs/BookmarkManagement'));
const SiteSettingsManagement = lazy(
  () => import('../../components/admin/tabs/SiteSettingsManagement')
);
const RateLimitManagement = lazy(() => import('../../components/admin/tabs/RateLimitManagement'));
const SecurityLogManagement = lazy(
  () => import('../../components/admin/tabs/SecurityLogManagement')
);
const ErrorLogManagement = lazy(() => import('../../components/admin/tabs/ErrorLogManagement'));
const TagManagement = lazy(() => import('../../components/admin/tabs/TagManagement'));
const LoginHistoryManagement = lazy(
  () => import('../../components/admin/tabs/LoginHistoryManagement')
);
const AuditLogManagement = lazy(() => import('../../components/admin/tabs/AuditLogManagement'));
const ReportManagement = lazy(() => import('../../components/admin/tabs/ReportManagement'));
const FileManagement = lazy(() => import('../../components/admin/tabs/FileManagement'));
const IpManagement = lazy(() => import('../../components/admin/tabs/IpManagement'));
const BoardManagerManagement = lazy(
  () => import('../../components/admin/tabs/BoardManagerManagement')
);

import { PageHeader } from '../../components/common/PageHeader';

// ...

const AdminUserPage = () => {
  const location = useLocation();

  // 관리자 탭(라우트) 전환 시 상단으로 (긴 탭→짧은 탭 잔여 스크롤 방지)
  // admin은 독립 라우트(=window 스크롤)이므로 공통 헬퍼로 처리
  useEffect(() => {
    scrollContentToTop();
  }, [location.pathname]);

  return (
    // admin은 Dashboard <main> 밖 독립 라우트라 배경/높이를 직접 제공
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <PageContainer>
        <PageHeader
          title="관리자 페이지"
          description="시스템 전체를 관리하는 컨트롤 센터"
          icon={
            <svg
              className="w-8 h-8 text-primary-600 dark:text-primary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          }
        />

        {/* 사이드바 네비게이션 + 콘텐츠 */}
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="flex-shrink-0 lg:w-56">
            <div className="card p-3 lg:sticky lg:top-6">
              <TabNavigation />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="card p-6">
              <Suspense
                fallback={
                  <LoadingSpinner
                    message="컴포넌트 로딩 중..."
                    hint="같은 탭을 다시 클릭하면 새로고침됩니다"
                  />
                }
              >
                <Routes>
                  <Route index element={<Navigate to="users" replace />} />
                  <Route path="users" element={<UserManagement />} />
                  <Route path="boards" element={<BoardManagement />} />
                  <Route path="roles" element={<RoleManagement />} />
                  <Route path="permissions" element={<PermissionManagement />} />
                  <Route
                    path="password-reset-requests"
                    element={<PasswordResetRequestManagement />}
                  />
                  <Route path="events" element={<EventManagement />} />
                  <Route path="bookmarks" element={<BookmarkManagement />} />
                  <Route path="rate-limits" element={<RateLimitManagement />} />
                  <Route path="site-settings" element={<SiteSettingsManagement />} />
                  <Route path="security-logs" element={<SecurityLogManagement />} />
                  <Route path="error-logs" element={<ErrorLogManagement />} />
                  <Route path="tags" element={<TagManagement />} />
                  <Route path="login-history" element={<LoginHistoryManagement />} />
                  <Route path="audit-logs" element={<AuditLogManagement />} />
                  <Route path="reports" element={<ReportManagement />} />
                  <Route path="files" element={<FileManagement />} />
                  <Route path="ip-management" element={<IpManagement />} />
                  <Route path="board-managers" element={<BoardManagerManagement />} />
                  {/* 잘못된 경로는 users로 리다이렉트 */}
                  <Route path="*" element={<Navigate to="users" replace />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
};

declare global {
  interface Window {
    boardPermissionTimer?: number;
    eventPermissionTimer?: number;
  }
}

export default AdminUserPage;
