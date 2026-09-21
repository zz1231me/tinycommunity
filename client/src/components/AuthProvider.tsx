import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../store/auth';
import { useAuthInit } from '../hooks/useAuthInit';
import { refreshToken } from '../api/auth';
import { formatDateTime, formatDate } from '../utils/date';
import { flagSessionExpired } from '../utils/sessionExpiry';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * 인증 프로바이더. 앱 시작 시 쿠키 토큰으로 자동 로그인하고, 만료 전에 백그라운드로 갱신한다.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const {
    isAuthenticated,
    user,
    clearUser,
    updateTokenInfo,
    isTokenExpiringSoon,
    isRefreshTokenExpired,
    isAccessTokenExpired,
    tokenInfo,
  } = useAuth();

  const { isLoading } = useAuthInit();
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshing = useRef(false);
  const [isTimerActive, setIsTimerActive] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user || !tokenInfo) {
      if (intervalRef.current) {
        if (import.meta.env.DEV) console.info('🛑 로그아웃 상태로 인한 토큰 갱신 타이머 정리');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsTimerActive(false);
      }
      isRefreshing.current = false;
      return;
    }

    if (intervalRef.current) {
      return;
    }

    if (import.meta.env.DEV) console.info('🔄 백그라운드 토큰 갱신 타이머 시작');

    setIsTimerActive(true);
    intervalRef.current = setInterval(async () => {
      if (isRefreshing.current) {
        return;
      }

      try {
        if (isRefreshTokenExpired()) {
          if (import.meta.env.DEV) console.info('❌ Refresh Token 만료, 로그아웃 처리');
          flagSessionExpired();
          clearUser();
          window.location.href = '/';
          return;
        }

        if (isTokenExpiringSoon(30)) {
          if (import.meta.env.DEV) console.info('🔄 토큰이 곧 만료됨, 사전 갱신 시도...');

          isRefreshing.current = true;

          try {
            const response = await refreshToken();

            // 갱신 중 로그아웃이면 플래그가 false 로 리셋되므로 재주입하지 않는다.
            if (!isRefreshing.current) return;

            if (response.data?.tokenInfo) {
              updateTokenInfo(response.data.tokenInfo);
              if (import.meta.env.DEV) console.info('✅ 사전 토큰 갱신 성공');
            }
          } catch (error) {
            if (import.meta.env.DEV) console.error('❌ 사전 토큰 갱신 실패:', error);

            if (isAccessTokenExpired()) {
              if (import.meta.env.DEV) console.info('🚪 Access Token 만료로 인한 자동 로그아웃');
              flagSessionExpired();
              clearUser();
              window.location.href = '/';
            }
          } finally {
            isRefreshing.current = false;
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error('토큰 상태 체크 오류:', error);
        isRefreshing.current = false;
      }
    }, 30 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsTimerActive(false);
      }
      isRefreshing.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, tokenInfo?.accessTokenExpiry]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary-500 mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">인증 상태 확인 중...</p>
          <p className="text-slate-400 text-sm mt-2">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}

      {import.meta.env.DEV && (
        <div className="fixed bottom-4 right-4 bg-black/75 text-white p-2 rounded text-xs z-50">
          <div>🔐 Login : {isAuthenticated ? '✅' : '❌'}</div>
          {user && (
            <>
              <div>👤 사용자: {user.name}</div>
              <div>🔄 자동갱신: {isTimerActive ? '✅' : '❌'}</div>
              {tokenInfo && (
                <>
                  <div>⏰ Access 만료: {formatDateTime(new Date(tokenInfo.accessTokenExpiry))}</div>
                  <div>🔑 Refresh 만료: {formatDate(new Date(tokenInfo.refreshTokenExpiry))}</div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
};
