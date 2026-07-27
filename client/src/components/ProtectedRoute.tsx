import { type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';

const ProtectedRoute = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated, isLoading, getUser } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (import.meta.env.DEV) {
      console.info('❌ 인증되지 않은 사용자, 로그인 페이지로 이동');
    }
    return <Navigate to="/" replace />;
  }

  // 강제 비밀번호 변경: 관리자 초기화 후 임시 비번으로 로그인한 사용자는 변경 페이지로 강제 이동.
  // (변경 페이지 자신은 예외 — 무한 리다이렉트 방지)
  if (getUser()?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return children;
};

export default ProtectedRoute;
