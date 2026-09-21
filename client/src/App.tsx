import { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import BoardProtectedRoute from './components/BoardProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { getSiteSettings } from './api/siteSettings';
import { useSiteSettings } from './store/siteSettings';
import { useAuth } from './store/auth';
import { useFeatures } from './store/features';
import { logger } from './utils/logger';
import { cacheSiteIdentity } from './utils/siteIdentityCache';
import { applyTheme } from './utils/applyTheme';
import { toast } from './utils/toast';
import { consumeSessionExpired } from './utils/sessionExpiry';
import { LoadingSpinner } from './components/admin/common/LoadingSpinner';
import { NotificationToast } from './components/common/NotificationToast';
import { UpdateBanner } from './components/common/UpdateBanner';
import { MaintenanceGate } from './components/MaintenanceGate';
import { FeatureRoute } from './components/common/FeatureRoute';
import { CheckInReminder } from './components/attendance/CheckInReminder';
import { WorkEndNotice } from './components/attendance/WorkEndNotice';
import { DashboardLanding } from './components/common/DashboardLanding';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Forbidden = lazy(() => import('./pages/Forbidden'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));
const PostList = lazy(() => import('./pages/boards/PostList'));
const PostDetail = lazy(() => import('./pages/boards/PostDetail'));
const PostEditor = lazy(() => import('./pages/boards/PostEditor'));
const CalendarPage = lazy(() => import('./pages/components/calendar/CalendarPage'));
const AdminUserPage = lazy(() => import('./pages/admin'));
const NotFound = lazy(() => import('./pages/NotFound'));
const MemoBoard = lazy(() => import('./pages/memos/MemoBoard'));
const WikiPageRoute = lazy(() => import('./pages/wiki/WikiPage'));
const LoginTwoFactor = lazy(() => import('./pages/LoginTwoFactor'));
const PasswordResetRequest = lazy(() => import('./pages/PasswordResetRequest'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const CustomPageView = lazy(() => import('./pages/CustomPageView'));
const Explore = lazy(() => import('./pages/Explore'));
const Scraps = lazy(() => import('./pages/Scraps'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const Drafts = lazy(() => import('./pages/Drafts'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Messages = lazy(() => import('./pages/Messages'));
const AttendancePage = lazy(() => import('./pages/attendance/AttendancePage'));

function App() {
  const { setSettings } = useSiteSettings();
  const { clearUser } = useAuth();
  const { isAuthenticated } = useAuth();
  const loadFeatures = useFeatures(s => s.load);

  // 다중 탭 동기화. 다른 탭에서 로그아웃하거나 다른 계정으로 로그인한 경우.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tokenInfo' && e.newValue === null && e.oldValue !== null) {
        clearUser();
        return;
      }
      // 다른 탭에서 다른 사람으로 로그인하면 쿠키가 바뀌므로 이 탭을 통째로 다시 불러온다.
      if (e.key === 'authUserId' && e.newValue && e.newValue !== useAuth.getState().user?.id) {
        window.location.reload();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [clearUser]);

  // 기능 스위치는 인증이 필요하므로 로그인 상태가 되면 불러온다. 실패해도 막지 않는다.
  useEffect(() => {
    if (isAuthenticated) loadFeatures();
  }, [isAuthenticated, loadFeatures]);

  // 세션 만료로 강제 로그아웃된 경우 1회 안내한다
  useEffect(() => {
    if (consumeSessionExpired()) {
      toast.warning('세션이 만료되어 로그아웃되었습니다. 다시 로그인해주세요.');
    }
  }, []);

  const loadSiteSettings = async () => {
    try {
      const settings = await getSiteSettings();

      setSettings(settings);

      // 지정이 없으면 기본 색으로 되돌린다
      applyTheme(settings.themePrimaryColor, settings.themeSecondaryColor);

      document.title = settings.siteTitle;

      if (settings.faviconUrl) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = settings.faviconUrl;
      }

      // index.html 의 인라인 스크립트가 첫 페인트 전에 읽는 캐시
      cacheSiteIdentity({
        siteName: settings.siteName,
        siteTitle: settings.siteTitle,
        faviconUrl: settings.faviconUrl,
      });

      if (settings.description) {
        let meta = document.querySelector("meta[name='description']") as HTMLMetaElement;
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'description';
          document.head.appendChild(meta);
        }
        meta.content = settings.description;
      }
    } catch (error) {
      logger.error('사이트 설정 로드 실패', error);
      // 실패해도 기본값으로 계속 진행한다
    }
  };

  useEffect(() => {
    loadSiteSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <NotificationToast />
        {/* 켜 둔 채로 배포가 일어났을 때 알리고, 안전한 순간에 스스로 새로고침한다 */}
        <UpdateBanner />
        {/* 관리자 화면은 대시보드 바깥이라 여기 두어야 어느 화면에서든 뜬다 */}
        <CheckInReminder />
        {/* 기준 근무 시간 10분 전 · 지나고 3분 뒤에 맨 위 띠로 알린다 */}
        <WorkEndNotice />
        {/* 점검 모드에서는 비관리자에게 안내 페이지를 보여 준다 */}
        <MaintenanceGate>
          {/* 로딩 중에는 스피너를 보여 준다 */}
          <Suspense
            fallback={
              <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-900">
                <LoadingSpinner message="페이지 로딩 중..." />
              </div>
            }
          >
            <Routes>
              {/* 공개 라우트 */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />
              <Route path="/login/2fa" element={<LoginTwoFactor />} />
              <Route path="/register" element={<Register />} />
              <Route path="/password-reset-request" element={<PasswordResetRequest />} />

              {/* 강제 비밀번호 변경. ProtectedRoute 가 여기로 보낸다. */}
              <Route
                path="/change-password"
                element={
                  <ProtectedRoute>
                    <ChangePassword />
                  </ProtectedRoute>
                }
              />

              {/* 이미 쌓인 '/attendance' 알림 링크를 출퇴근 화면으로 돌려보낸다 */}
              <Route path="/attendance" element={<Navigate to="/dashboard/attendance" replace />} />

              {/* 프로필 */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />

              {/* 권한 없음 안내 */}
              <Route
                path="/unauthorized"
                element={
                  <ProtectedRoute>
                    <Unauthorized />
                  </ProtectedRoute>
                }
              />

              {/* 접근 금지(IP 차단 등) */}
              <Route path="/forbidden" element={<Forbidden />} />

              {/* 대시보드와 하위 페이지 */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              >
                {/* 켜져 있는 화면으로 보낸다 */}
                <Route index element={<DashboardLanding />} />

                {/* 주요 화면 */}
                {/* 꺼진 기능도 주소 직접 입력·알림 링크로 닿을 수 있어 안내 화면을 둔다 */}
                <Route
                  path="calendar"
                  element={
                    <FeatureRoute feature="tools.calendar" name="일정">
                      <CalendarPage />
                    </FeatureRoute>
                  }
                />
                <Route path="explore" element={<Explore />} />
                <Route
                  path="scraps"
                  element={
                    <FeatureRoute feature="post.scrap" name="스크랩">
                      <Scraps />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="drafts"
                  element={
                    <FeatureRoute feature="post.drafts" name="임시저장">
                      <Drafts />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="tasks"
                  element={
                    <FeatureRoute feature="post.tasks" name="내 업무">
                      <MyTasks />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="users/:id"
                  element={
                    <FeatureRoute feature="social.profiles" name="사용자 프로필">
                      <UserProfile />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="messages"
                  element={
                    <FeatureRoute feature="social.dm" name="다이렉트 메시지">
                      <Messages />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="messages/:id"
                  element={
                    <FeatureRoute feature="social.dm" name="다이렉트 메시지">
                      <Messages />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="memos"
                  element={
                    <FeatureRoute feature="tools.memo" name="메모">
                      <MemoBoard />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="attendance"
                  element={
                    <FeatureRoute feature="tools.attendance" name="출퇴근 기록">
                      <AttendancePage />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="wiki"
                  element={
                    <FeatureRoute feature="tools.wiki" name="위키">
                      <WikiPageRoute />
                    </FeatureRoute>
                  }
                />
                <Route
                  path="wiki/:slug"
                  element={
                    <FeatureRoute feature="tools.wiki" name="위키">
                      <WikiPageRoute />
                    </FeatureRoute>
                  }
                />
                <Route path="pages/:slug" element={<CustomPageView />} />

                {/* 게시글 */}
                <Route
                  path="posts/:boardType/new"
                  element={
                    <BoardProtectedRoute action="write">
                      <PostEditor mode="create" />
                    </BoardProtectedRoute>
                  }
                />

                <Route
                  path="posts/:boardType/edit/:id"
                  element={
                    <BoardProtectedRoute action="write">
                      <PostEditor mode="edit" />
                    </BoardProtectedRoute>
                  }
                />

                <Route
                  path="posts/:boardType/:id"
                  element={
                    <BoardProtectedRoute action="read">
                      <PostDetail />
                    </BoardProtectedRoute>
                  }
                />

                <Route
                  path="posts/:boardType"
                  element={
                    <BoardProtectedRoute action="read">
                      <PostList />
                    </BoardProtectedRoute>
                  }
                />
              </Route>

              {/* 관리자 전용(/admin) */}
              <Route
                path="/admin/*"
                element={
                  <RoleProtectedRoute allowedRoles={['admin']}>
                    <AdminUserPage />
                  </RoleProtectedRoute>
                }
              />

              {/* 404 는 가장 마지막에 둔다 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </MaintenanceGate>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
