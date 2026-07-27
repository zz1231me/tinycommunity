// client/src/hooks/useAuthInit.ts
import { useEffect, useRef } from 'react';
import { useAuth } from '../store/auth';
import { getCurrentUser, refreshToken } from '../api/auth';

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.info(...args);
};
const devWarn = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.warn(...args);
};
const devError = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.error(...args);
};

/**
 * 앱 시작 시 인증 상태를 초기화하는 훅
 * 쿠키에 토큰이 있으면 자동으로 사용자 정보를 가져와서 로그인 상태로 설정
 * localStorage에서 토큰 정보를 복원하고 만료 상태를 체크하여 자동 갱신
 */
export const useAuthInit = () => {
  const { setUser, clearUser, setLoading, isLoading } = useAuth();

  // ✅ useRef로 초기화 여부 관리 - 전역 window 오염 없이 컴포넌트 수준에서 중복 실행 방지
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // ✅ useRef 플래그로 초기화 상태 확인
    if (isInitializedRef.current) {
      devLog('ℹ️ 인증 초기화 이미 진행 중 (useRef 플래그), 스킵');
      return;
    }

    devLog('🔄 인증 초기화 시작 준비...');
    isInitializedRef.current = true; // useRef 플래그 설정

    let isCompleted = false;

    const initializeAuth = async () => {
      devLog('🔄 인증 상태 초기화 시작...');
      setLoading(true);

      try {
        // ✅ 1단계: 서버에서 현재 사용자 정보 조회 (쿠키 기반)
        devLog('📡 /api/auth/me 호출 시작...');

        try {
          // ✅ api 인스턴스 사용 → 419(토큰 만료) 시 인터셉터가 자동으로 갱신 후 재시도
          const response = await getCurrentUser();
          devLog('✅ /api/auth/me 응답 받음:', response);

          // sendSuccess 구조: { success, data: { user, tokenInfo } }
          const userData = response.data?.user;
          const tokenInfoData = response.data?.tokenInfo;

          if (userData) {
            setUser(userData, tokenInfoData ?? undefined);
            devLog('✅ 인증 상태 복원 성공:', userData.name);
            devLog('🔐 사용자 역할:', userData.roleInfo?.name || '알 수 없음');
            return;
          }

          devWarn('⚠️ 서버 응답에 user 정보 없음');
          clearUser();
        } catch (getCurrentError: unknown) {
          // ✅ 401: 쿠키에 access_token 자체가 없는 경우 → refresh 수동 시도
          //    419: 인터셉터가 이미 처리했으나 갱신 실패 → 여기서는 재시도하지 않음
          const axiosError = getCurrentError as { response?: { status?: number } };
          const statusCode = axiosError.response?.status;

          // 401/419는 "로그인 안 됨/토큰 만료"라는 정상 초기화 경로다. 로그아웃 방문자가 앱을
          // 열 때마다 콘솔에 빨간 에러가 찍히면 실제 버그처럼 보이므로, 예상된 상태는 info로만
          // 남기고 예상 밖(500 등)일 때만 error로 기록한다.
          if (statusCode === 401 || statusCode === 419) {
            devLog('ℹ️ /api/auth/me 미인증(status:', statusCode, ') — 정상 초기화 경로');
          } else {
            devError('❌ /api/auth/me 호출 실패:', getCurrentError);
          }

          if (statusCode === 401) {
            devLog('🔄 토큰 없음 감지, Refresh Token으로 직접 갱신 시도...');
            try {
              const refreshResponse = await refreshToken();
              devLog('✅ Refresh Token 응답 받음:', refreshResponse);

              const refreshUser = refreshResponse.data?.user;
              const refreshTokenInfo = refreshResponse.data?.tokenInfo;
              if (refreshUser && refreshTokenInfo) {
                setUser(refreshUser, refreshTokenInfo);
                devLog('✅ Refresh Token으로 인증 성공:', refreshUser.name);
                return;
              }
              devWarn('⚠️ Refresh Token 응답에 user/tokenInfo 없음');
              clearUser();
            } catch {
              // refresh 실패 = 유효한 세션 없음(로그아웃 방문자) — 정상 경로라 info로만 기록
              devLog('ℹ️ Refresh Token 없음/만료 — 로그아웃 상태로 처리');
              clearUser();
            }
          } else {
            devLog('❌ 인증 실패, 로그아웃 처리 (status:', statusCode, ')');
            clearUser();
          }
        }
      } catch (error) {
        devError('❌ 인증 초기화 중 예외 발생:', error);
        clearUser();
      } finally {
        setLoading(false);
        isCompleted = true;
        devLog('✅ 인증 상태 초기화 완료 (finally 블록)');
      }
    };

    // ✅ 초기화 함수를 비동기로 실행하되, 타임아웃 추가 (15초 제한)
    const timeoutId = setTimeout(() => {
      if (!isCompleted) {
        devError('인증 초기화 타임아웃 (15초), 강제 종료');
        clearUser();
        setLoading(false);
        // 플래그는 true로 유지: 타임아웃 후 재마운트 시 이중 초기화 방지
      }
    }, 15000);

    // 초기화 함수 실행
    initializeAuth().finally(() => {
      clearTimeout(timeoutId);
      devLog('🏁 initializeAuth 완료');
      // 성공적으로 완료되면 플래그는 true로 유지 (재초기화 방지)
    });

    // ✅ Cleanup 함수 - StrictMode 이중 렌더링 대응
    return () => {
      devLog('🧹 useAuthInit cleanup 실행');
      // ✅ cleanup에서는 타이머만 정리하고 플래그는 유지
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // 플래그는 초기화 완료 후에도 유지되어야 함 (재초기화 방지)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ✅ 빈 배열 - 마운트 시 한 번만 실행

  // 로딩 상태 반환 (컴포넌트에서 사용할 수 있도록)
  return { isLoading };
};
