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

/** 앱 시작 시 쿠키 기반으로 인증 상태를 복원한다. */
export const useAuthInit = () => {
  const { setUser, clearUser, setLoading, isLoading } = useAuth();

  // 컴포넌트 수준에서 중복 실행을 막는다.
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (isInitializedRef.current) {
      devLog('ℹ️ 인증 초기화 이미 진행 중 (useRef 플래그), 스킵');
      return;
    }

    devLog('🔄 인증 초기화 시작 준비...');
    isInitializedRef.current = true;

    let isCompleted = false;

    const initializeAuth = async () => {
      devLog('🔄 인증 상태 초기화 시작...');
      setLoading(true);

      try {
        devLog('📡 /api/auth/me 호출 시작...');

        try {
          // 419 면 인터셉터가 토큰을 갱신하고 재시도한다.
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
          // 401 은 access_token 이 없는 경우라 refresh 를 직접 시도하고, 419 는 인터셉터가 이미 처리했다.
          const axiosError = getCurrentError as { response?: { status?: number } };
          const statusCode = axiosError.response?.status;

          // 401·419 는 정상 초기화 경로라 info 로만 남기고, 예상 밖 상태만 error 로 기록한다.
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
              // refresh 실패는 유효한 세션이 없는 정상 경로다.
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

    // 15초 안에 끝나지 않으면 강제 종료한다.
    const timeoutId = setTimeout(() => {
      if (!isCompleted) {
        devError('인증 초기화 타임아웃 (15초), 강제 종료');
        clearUser();
        setLoading(false);
        // 플래그는 true 로 유지해 재마운트 시 이중 초기화를 막는다.
      }
    }, 15000);

    initializeAuth().finally(() => {
      clearTimeout(timeoutId);
      devLog('🏁 initializeAuth 완료');
    });

    return () => {
      devLog('🧹 useAuthInit cleanup 실행');
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isLoading };
};
