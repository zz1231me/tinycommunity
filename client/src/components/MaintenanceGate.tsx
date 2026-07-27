// client/src/components/MaintenanceGate.tsx
// 점검 모드(maintenanceMode) 기능. 설정은 관리자 페이지에 있었으나 어디서도 표시/적용되지
// 않아 토글이 무동작이었음 — 이 게이트가 실제로 동작시킨다.
//
// 정책:
// - 점검 모드 OFF: 평소대로 렌더.
// - 점검 모드 ON:
//   · 관리자: 정상 사용(점검 모드를 끌 수 있어야 하므로) + 상단 안내 배너.
//   · 그 외(비로그인/일반 사용자): 점검 안내 페이지. 단 로그인 경로는 열어둬 관리자가
//     로그인해 점검을 해제할 수 있게 한다.
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { useSiteSettings } from '../store/siteSettings';
import { useAuth } from '../store/auth';

// 점검 중에도 접근 가능한 경로 — 관리자 로그인 동선만 열어둔다.
// 주의: 기본 경로 '/'는 일부러 제외한다. 비로그인 사용자는 ProtectedRoute에 의해 '/'로
// 리다이렉트되는데, '/'를 예외로 두면 (설정 로드 전 race까지 겹쳐) 점검 페이지 대신 로그인폼이
// 떠버린다. '/'에서도 점검 페이지를 보이고, 로그인은 '/login'(점검 페이지의 '관리자 로그인'
// 링크) 또는 비밀번호 찾기 경로로만 진입하게 한다.
const AUTH_PATHS = ['/login', '/login/2fa', '/password-reset-request', '/reset-password'];

const MaintenancePage: React.FC<{ message: string | null; siteName: string }> = ({
  message,
  siteName,
}) => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
    <div className="w-full max-w-md text-center">
      <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
        <Wrench className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-3">
        {siteName} 점검 중
      </h1>
      <p className="text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
        {message?.trim() ||
          '더 나은 서비스를 위해 시스템 점검 중입니다.\n잠시 후 다시 이용해 주세요.'}
      </p>
      <Link
        to="/login"
        className="inline-block mt-8 text-sm text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors"
      >
        관리자 로그인
      </Link>
    </div>
  </div>
);

export const MaintenanceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const maintenanceMode = useSiteSettings(s => s.settings.maintenanceMode);
  const maintenanceMessage = useSiteSettings(s => s.settings.maintenanceMessage);
  const siteName = useSiteSettings(s => s.settings.siteName);
  const { isAuthenticated, getUserRole } = useAuth();
  const location = useLocation();

  if (!maintenanceMode) return <>{children}</>;

  const isAdmin = isAuthenticated && getUserRole() === 'admin';

  // 관리자가 아니고 인증/로그인 경로도 아니면 점검 페이지 표시
  if (!isAdmin && !AUTH_PATHS.includes(location.pathname)) {
    return <MaintenancePage message={maintenanceMessage} siteName={siteName} />;
  }

  // 관리자에게는 점검 모드가 켜져 있음을 상단 배너로 알림(끄러 갈 수 있도록)
  return (
    <>
      {isAdmin && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-amber-500 text-white text-xs sm:text-sm text-center py-1.5 px-4 font-medium shadow">
          🔧 점검 모드가 켜져 있습니다 — 일반 사용자에게는 점검 안내가 표시됩니다. (관리자만 이용
          가능)
        </div>
      )}
      {children}
    </>
  );
};
