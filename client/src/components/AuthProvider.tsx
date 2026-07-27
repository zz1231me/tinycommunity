// client/src/components/AuthProvider.tsx
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
 * 인증 상태를 관리하는 프로바이더 컴포넌트
 * 앱 시작 시 쿠키의 토큰을 확인해서 자동 로그인 처리
 * 백그라운드에서 토큰 만료 시간을 체크하여 스마트하게 갱신
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
  const isRefreshing = useRef(false); // ✅ 토큰 갱신 중 플래그 추가
  const [isTimerActive, setIsTimerActive] = useState(false);

  // 🔄 스마트한 백그라운드 토큰 갱신 설정 (개선됨)
  useEffect(() => {
    // ✅ 로그인 상태가 아니면 타이머 정리하고 종료
    if (!isAuthenticated || !user || !tokenInfo) {
      if (intervalRef.current) {
        if (import.meta.env.DEV) console.info('🛑 로그아웃 상태로 인한 토큰 갱신 타이머 정리');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsTimerActive(false);
      }
      isRefreshing.current = false; // ✅ 갱신 플래그 리셋
      return;
    }

    // ✅ 이미 타이머가 실행 중이면 스킵 (중복 방지)
    if (intervalRef.current) {
      return;
    }

    if (import.meta.env.DEV) console.info('🔄 백그라운드 토큰 갱신 타이머 시작');

    // ✅ 30초마다 체크
    setIsTimerActive(true);
    intervalRef.current = setInterval(async () => {
      // ✅ 이미 갱신 중이면 스킵
      if (isRefreshing.current) {
        return;
      }

      try {
        // Refresh Token 만료 체크
        if (isRefreshTokenExpired()) {
          if (import.meta.env.DEV) console.info('❌ Refresh Token 만료, 로그아웃 처리');
          flagSessionExpired();
          clearUser();
          window.location.href = '/';
          return;
        }

        // ✅ Access Token이 30분 내로 만료될 예정인지 체크
        if (isTokenExpiringSoon(30)) {
          if (import.meta.env.DEV) console.info('🔄 토큰이 곧 만료됨, 사전 갱신 시도...');

          isRefreshing.current = true; // ✅ 갱신 시작

          try {
            const response = await refreshToken();

            // 갱신 중 로그아웃(clearUser)이 발생했으면 플래그가 false로 리셋됨 → 재주입 방지
            if (!isRefreshing.current) return;

            if (response.data?.tokenInfo) {
              updateTokenInfo(response.data.tokenInfo);
              if (import.meta.env.DEV) console.info('✅ 사전 토큰 갱신 성공');
            }
          } catch (error) {
            if (import.meta.env.DEV) console.error('❌ 사전 토큰 갱신 실패:', error);

            // ✅ Access Token이 실제로 만료되었는지 재확인
            if (isAccessTokenExpired()) {
              if (import.meta.env.DEV) console.info('🚪 Access Token 만료로 인한 자동 로그아웃');
              flagSessionExpired();
              clearUser();
              window.location.href = '/';
            }
          } finally {
            isRefreshing.current = false; // ✅ 갱신 완료
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error('토큰 상태 체크 오류:', error);
        isRefreshing.current = false; // ✅ 오류 발생 시에도 플래그 리셋
      }
    }, 30 * 1000); // ✅ 30초마다 실행

    // ✅ 정리 함수 - 컴포넌트 언마운트 또는 의존성 변경 시
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsTimerActive(false);
      }
      isRefreshing.current = false; // ✅ 플래그 리셋
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, tokenInfo?.accessTokenExpiry]); // ✅ tokenInfo 변경 시에도 타이머 재설정

  // 인증 상태 초기화 중이면 로딩 화면 표시
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 text-lg">인증 상태 확인 중...</p>
          <p className="text-slate-400 text-sm mt-2">잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  // 인증 상태 초기화 완료 후 자식 컴포넌트 렌더링
  return (
    <>
      {children}

      {/* 개발 환경에서만 보이는 인증 상태 디버깅 정보 */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs z-50">
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
