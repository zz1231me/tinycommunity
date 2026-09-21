// client/src/components/MaintenanceGate.tsx
// 점검 모드(maintenanceMode)를 실제로 적용하는 게이트.
//
// 정책:
// - 점검 모드 OFF: 평소대로 렌더.
// - 점검 모드 ON:
//   · 관리자: 정상 사용(점검 모드를 끌 수 있어야 하므로) + 상단 안내 배너.
//   · 그 외(비로그인/일반 사용자): 점검 안내 페이지. 단 로그인 경로는 열어둬 관리자가
//     로그인해 점검을 해제할 수 있게 한다.
import React, { useEffect, useRef } from 'react';
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
 * 배너 높이만큼 대시보드 틀을 줄인다.
 * 예전에는 화면에 고정된 띠(fixed)라 자리를 차지하지 않아 머리글 위쪽 절반(로고·메뉴
 * 단추)을 덮었고, 덮인 부분은 눌러도 배너가 먹었다. 이제 흐름 안의 줄로 두는 대신,
 * 100vh 를 쓰는 틀이 그만큼 화면 밖으로 밀리지 않게 높이를 줄여 준다.
 *
 * 높이는 재서 쓴다. 글이 길어 좁은 화면에서는 두 줄이 되고, 글자 크기도 sm 에서
 * 달라진다 — 고정값을 적어 두면 그때마다 어긋난다.
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

  // 훅은 조기 반환보다 위에 둔다 — 렌더마다 호출 순서가 같아야 한다
  const barRef = useRef<HTMLDivElement>(null);
  useMaintenanceBarSpace(barRef, maintenanceMode && isAdmin);

  if (!maintenanceMode) return <>{children}</>;

  // 관리자가 아니고 인증/로그인 경로도 아니면 점검 페이지 표시
  if (!isAdmin && !AUTH_PATHS.includes(location.pathname)) {
    return <MaintenancePage message={maintenanceMessage} siteName={siteName} />;
  }

  // 관리자에게는 점검 모드가 켜져 있음을 상단 배너로 알림(끄러 갈 수 있도록)
  return (
    <>
      {isAdmin && (
        <div
          ref={barRef}
          className="maintenance-bar bg-amber-500 text-white text-xs sm:text-sm text-center py-1.5 px-4 font-medium shadow"
        >
          🔧 점검 모드가 켜져 있습니다 — 일반 사용자에게는 점검 안내가 표시됩니다. (관리자만 이용
          가능)
        </div>
      )}
      {children}
    </>
  );
};
