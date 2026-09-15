// App.tsx - 회원가입 승인 시스템이 적용된 메인 애플리케이션 컴포넌트
//
// 성능 최적화: React.lazy 및 Suspense 적용
// 라우팅 구조 개선

import { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { MaintenanceGate } from './components/MaintenanceGate';
import { FeatureRoute } from './components/common/FeatureRoute';
import { DashboardLanding } from './components/common/DashboardLanding';

// Lazy Loading applied to all page components
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

  // 다중 탭 로그아웃 동기화 - 다른 탭에서 로그아웃 시 이 탭도 로그아웃
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tokenInfo' && e.newValue === null && e.oldValue !== null) {
        clearUser();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [clearUser]);

  // 기능 스위치는 인증이 필요하다 — 로그인 상태가 되면 불러온다.
  // 못 불러와도 화면은 아무것도 숨기지 않으므로(store 주석 참고) 실패를 막지 않는다.
  useEffect(() => {
    if (isAuthenticated) loadFeatures();
  }, [isAuthenticated, loadFeatures]);

  // 세션 만료로 강제 로그아웃된 경우(하드 리다이렉트 직후) 1회성 안내 토스트
  useEffect(() => {
    if (consumeSessionExpired()) {
      toast.warning('세션이 만료되어 로그아웃되었습니다. 다시 로그인해주세요.');
    }
  }, []);

  const loadSiteSettings = async () => {
    try {
      const settings = await getSiteSettings();

      // Store에 저장
      setSettings(settings);

      // 관리자가 고른 브랜드 색 적용 — 지정이 없으면 기본 색으로 되돌린다
      applyTheme(settings.themePrimaryColor, settings.themeSecondaryColor);

      // 타이틀 업데이트
      document.title = settings.siteTitle;

      // 파비콘 업데이트
      if (settings.faviconUrl) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = settings.faviconUrl;
      }

      // 다음 새로고침 때 깜빡임 없이 즉시 적용되도록 캐시 — index.html의 인라인 스크립트가
      // 첫 페인트 전에 이 값을 읽어 적용한다.
      cacheSiteIdentity({
        siteName: settings.siteName,
        siteTitle: settings.siteTitle,
        faviconUrl: settings.faviconUrl,
      });

      // 메타 설명 업데이트
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
      // 실패해도 계속 진행 (기본값 사용)
    }
  };

  // 앱 시작 시 사이트 설정 로드
  useEffect(() => {
    loadSiteSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <NotificationToast />
        {/* 점검 모드 게이트 — 점검 ON 시 비관리자에게 안내 페이지 표시(관리자는 우회) */}
        <MaintenanceGate>
          {/* 🚀 Suspense로 로딩 중 상태 처리 */}
          <Suspense
            fallback={
              <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-900">
                <LoadingSpinner message="페이지 로딩 중..." />
              </div>
            }
          >
            <Routes>
              {/* ✅ 공개 라우트 */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />
              <Route path="/login/2fa" element={<LoginTwoFactor />} />
              <Route path="/register" element={<Register />} />
              <Route path="/password-reset-request" element={<PasswordResetRequest />} />

              {/* ✅ 강제 비밀번호 변경 (관리자 초기화 후) — ProtectedRoute가 여기로 강제 이동 */}
              <Route
                path="/change-password"
                element={
                  <ProtectedRoute>
                    <ChangePassword />
                  </ProtectedRoute>
                }
              />

              {/* ✅ 프로필 페이지 - 독립적인 보호된 라우트 */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />

              {/* ✅ 권한 없음 안내 페이지 - 인증된 사용자만 접근 가능 */}
              <Route
                path="/unauthorized"
                element={
                  <ProtectedRoute>
                    <Unauthorized />
                  </ProtectedRoute>
                }
              />

              {/* ✅ 접근 금지 페이지 - IP 차단 등 */}
              <Route path="/forbidden" element={<Forbidden />} />

              {/* ✅ 보호된 경로: 대시보드 및 하위 페이지들 */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              >
                {/* 켜져 있는 곳으로 보낸다 — 일정이 꺼져 있으면 첫 화면이 막힌다 */}
                <Route index element={<DashboardLanding />} />

                {/* 주요 화면 라우팅 */}
                {/* 꺼진 기능은 빈 화면 대신 무슨 일인지 알려 준다.
                    메뉴를 숨기는 것만으로는 주소 직접 입력·알림 링크가 남는다. */}
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

                {/* ✅ 게시글 관련 - 권한 보호됨 */}
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

              {/* ✅ 관리자 전용 라우트 - 별도 독립 페이지 (/admin) */}
              <Route
                path="/admin/*"
                element={
                  <RoleProtectedRoute allowedRoles={['admin']}>
                    <AdminUserPage />
                  </RoleProtectedRoute>
                }
              />

              {/* ✅ 404 페이지 - 가장 마지막에 배치 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </MaintenanceGate>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
