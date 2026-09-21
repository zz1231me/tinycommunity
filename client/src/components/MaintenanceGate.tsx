// 점검 모드 게이트. 관리자는 정상 사용에 안내 배너만 붙고, 그 외에는 점검 안내 페이지를 본다.
import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { useSiteSettings } from '../store/siteSettings';
import { useAuth } from '../store/auth';

// 점검 중에도 열어 두는 경로. '/'를 넣으면 점검 페이지 대신 로그인폼이 떠서 제외한다.
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
        {message?.trim() || '현재 서비스 점검 중입니다.\n잠시 후 다시 이용해주세요.'}
      </p>
      <Link
        to="/login"
        className="inline-block mt-8 text-sm text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors"
      >
        관리자 로그인
      </Link>
    </div>
  </div>
);

/**
 * 배너 높이만큼 대시보드 틀을 줄인다. 줄 수·글자 크기에 따라 달라지므로 실제로 재서 쓴다.
 */
function useMaintenanceBarSpace(barRef: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (!active) return;
    root.classList.add('has-maintenance-bar');

    const bar = barRef.current;
    const apply = () => {
      root.style.setProperty('--maintenance-bar-h', `${bar?.offsetHeight ?? 0}px`);
    };
    apply();
    const ro = bar ? new ResizeObserver(apply) : null;
    if (bar) ro?.observe(bar);

    return () => {
      ro?.disconnect();
      root.classList.remove('has-maintenance-bar');
      root.style.removeProperty('--maintenance-bar-h');
    };
  }, [barRef, active]);
}

export const MaintenanceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const maintenanceMode = useSiteSettings(s => s.settings.maintenanceMode);
  const maintenanceMessage = useSiteSettings(s => s.settings.maintenanceMessage);
  const siteName = useSiteSettings(s => s.settings.siteName);
  const { isAuthenticated, getUserRole } = useAuth();
  const location = useLocation();
  const isAdmin = isAuthenticated && getUserRole() === 'admin';

  // 훅은 조기 반환보다 위에 둔다.
  const barRef = useRef<HTMLDivElement>(null);
  useMaintenanceBarSpace(barRef, maintenanceMode && isAdmin);

  if (!maintenanceMode) return <>{children}</>;

  if (!isAdmin && !AUTH_PATHS.includes(location.pathname)) {
    return <MaintenancePage message={maintenanceMessage} siteName={siteName} />;
  }

  return (
    <>
      {isAdmin && (
        <div
          ref={barRef}
          className="maintenance-bar bg-amber-400 text-slate-900 text-xs sm:text-sm text-center py-1.5 px-4 font-medium shadow"
        >
          🔧 점검 모드가 켜져 있습니다 — 일반 사용자에게는 점검 안내가 표시됩니다. (관리자만 이용
          가능)
        </div>
      )}
      {children}
    </>
  );
};
