// client/src/api/axios.ts
import axios from 'axios';
import { refreshToken } from './auth';
import { useAuth } from '../store/auth';
import { flagSessionExpired } from '../utils/sessionExpiry';

const REDIRECT_LOGIN = '/';
const REDIRECT_FORBIDDEN = '/forbidden';
const AUTH_ENDPOINTS = ['/auth/me', '/auth/refresh'];

// 세션 만료(토큰 갱신 실패/401)로 로그인 페이지로 강제 이동.
// "로그인 상태였는지"를 zustand store의 user로 판단하면 안 된다 — store는 매 페이지 로드 시
// 비어 있고 /auth/me 성공 후에야 채워지므로, 콜드 리로드 직후(만료가 가장 흔히 감지되는 시점)엔
// user가 아직 null이라 안내 토스트를 놓친다. 대신 로그인 시 저장되고 clearUser 시 제거되는
// localStorage 'tokenInfo' 존재로 판단한다(리로드에도 유지). 비로그인 방문자는 값이 없어 오인 없음.
const hadSession = (): boolean => {
  try {
    return localStorage.getItem('tokenInfo') !== null;
  } catch {
    return false;
  }
};
const redirectToLogin = (): void => {
  if (hadSession()) flagSessionExpired();
  window.location.href = REDIRECT_LOGIN;
};

// 토큰 갱신 응답에서 tokenInfo를 추출해 zustand store를 동기화
// (인터셉터 자동 갱신 후 클라이언트 store의 만료시각이 stale 상태가 되면,
//  AuthProvider 폴링이 "곧 만료" 판정을 계속 내려 중복 갱신 race가 발생함)
const syncTokenInfoFromRefresh = (refreshResponse: unknown): void => {
  try {
    // sendSuccess 봉투: { success, data: { tokenInfo: {...} } }
    const payload = (refreshResponse as { data?: { tokenInfo?: unknown } } | undefined)?.data;
    const tokenInfo = (payload as { tokenInfo?: unknown } | undefined)?.tokenInfo as
      | { accessTokenExpiry: number; refreshTokenExpiry: number }
      | undefined;
    if (
      tokenInfo &&
      typeof tokenInfo.accessTokenExpiry === 'number' &&
      typeof tokenInfo.refreshTokenExpiry === 'number'
    ) {
      useAuth.getState().updateTokenInfo(tokenInfo);
    }
  } catch {
    // store 동기화 실패는 무시 — 다음 폴링이 보정함
  }
};
// 비밀글 비밀번호 검증 엔드포인트 — 401(비밀번호 틀림)이어도 로그인 리다이렉트 하지 않음
const SECRET_VERIFY_PATTERN = /\/posts\/[^/]+\/[^/]+\/verify/;

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // ✅ 쿠키 포함하여 요청
  timeout: 30000, // ✅ 30초 타임아웃 설정
  headers: {
    'X-Requested-With': 'XMLHttpRequest', // ✅ CSRF 보호용 헤더
  },
});

// DEV 환경에서만 로그 출력
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) console.info(...args);
};

// 🔒 토큰 갱신 중복 요청 방지
let isRefreshing = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RefreshSubscriber = { resolve: () => void; reject: (err: any) => void };
let refreshSubscribers: RefreshSubscriber[] = [];

const onRefreshed = () => {
  refreshSubscribers.forEach(sub => sub.resolve());
  refreshSubscribers = [];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onRefreshFailed = (err: any) => {
  refreshSubscribers.forEach(sub => sub.reject(err));
  refreshSubscribers = [];
};

// 🔄 요청 인터셉터 - sessionStorage 관련 코드 제거
api.interceptors.request.use(
  config => {
    // 쿠키는 자동으로 전송되므로 추가 설정 불필요
    devLog(`📤 API 요청: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 🔄 응답 인터셉터 - 자동 토큰 갱신 포함
api.interceptors.response.use(
  response => {
    devLog(
      `📥 API 응답: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`
    );
    return response;
  },
  async error => {
    const originalRequest = error.config;

    // ✅ /api/auth/me와 /api/auth/refresh 요청은 자동 리다이렉트 제외
    const isAuthEndpoint = AUTH_ENDPOINTS.some(ep => originalRequest?.url?.includes(ep));

    // 419 상태 코드: Access Token 만료 (자동 갱신 시도)
    if (error.response?.status === 419 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        devLog('🔄 Access Token 만료 감지, 자동 갱신 시도...');

        try {
          // Refresh Token으로 새 Access Token 발급
          const refreshResponse = await refreshToken();
          syncTokenInfoFromRefresh(refreshResponse);
          onRefreshed();

          // 원래 요청 재시도
          return api(originalRequest);
        } catch (refreshError) {
          // ✅ 대기 중인 모든 subscriber에 에러 전파 (무한 대기 방지)
          onRefreshFailed(refreshError);
          // ✅ 인증 엔드포인트가 아닌 경우에만 리다이렉트 (세션 만료 안내 포함)
          if (!isAuthEndpoint) {
            redirectToLogin();
          }
          return Promise.reject(refreshError);
        } finally {
          // ✅ 성공/실패 모두 isRefreshing 리셋 보장 (무한 대기 방지)
          isRefreshing = false;
        }
      } else {
        // ✅ 이미 갱신 중이면 갱신 완료 후 원래 요청 재시도 (reject 포함)
        return new Promise((resolve, reject) => {
          refreshSubscribers.push({
            resolve: () => resolve(api(originalRequest)),
            reject,
          });
        });
      }
    }

    // 401 상태 코드: 인증 실패
    if (error.response?.status === 401) {
      // ✅ 인증 엔드포인트 및 비밀글 검증 엔드포인트는 리다이렉트 제외
      const isSecretVerify = SECRET_VERIFY_PATTERN.test(originalRequest?.url ?? '');
      if (!isAuthEndpoint && !isSecretVerify) {
        redirectToLogin();
      }
    }

    // 403 상태 코드: 계정/역할 비활성화 등 세션 자체가 유효하지 않은 경우만 리다이렉트
    // 일반 권한 거부(게시판 쓰기 불가 등)는 각 UI에서 처리하도록 그냥 reject
    if (error.response?.status === 403) {
      const msg: string = error.response?.data?.message || '';
      const isSessionInvalid =
        msg.includes('삭제된 계정') ||
        msg.includes('비활성화된 계정') ||
        msg.includes('비활성화된 역할') ||
        msg.includes('역할 정보가 없습니다');
      if (isSessionInvalid) {
        window.location.href = REDIRECT_FORBIDDEN;
      }
    }

    return Promise.reject(error);
  }
);

// ✅ 파일 업로드용 인스턴스 (타임아웃 없음 - 대용량 파일 업로드 지원)
export const uploadApi = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 0, // 무제한 (파일 크기에 따라 오래 걸릴 수 있음)
  headers: {
    'X-Requested-With': 'XMLHttpRequest', // ✅ CSRF 보호용 헤더
  },
});

// 업로드 인스턴스에도 동일한 인터셉터 적용 (main api의 isRefreshing 큐 공유)
uploadApi.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 419 && !error.config._retry) {
      error.config._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshResponse = await refreshToken();
          syncTokenInfoFromRefresh(refreshResponse);
          onRefreshed();
          return uploadApi(error.config);
        } catch (refreshErr) {
          onRefreshFailed(refreshErr);
          redirectToLogin();
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      } else {
        // 이미 갱신 중이면 완료 후 재시도
        return new Promise((resolve, reject) => {
          refreshSubscribers.push({
            resolve: () => resolve(uploadApi(error.config)),
            reject,
          });
        });
      }
    }

    if (error.response?.status === 401) {
      // ✅ api 인터셉터와 동일하게 인증/비밀글 엔드포인트는 리다이렉트 제외
      const uploadUrl = error.config?.url ?? '';
      const isUploadAuthEndpoint = AUTH_ENDPOINTS.some(ep => uploadUrl.includes(ep));
      const isUploadSecretVerify = SECRET_VERIFY_PATTERN.test(uploadUrl);
      if (!isUploadAuthEndpoint && !isUploadSecretVerify) {
        redirectToLogin();
      }
    }

    if (error.response?.status === 403) {
      const msg: string = error.response?.data?.message || '';
      const isSessionInvalid =
        msg.includes('삭제된 계정') ||
        msg.includes('비활성화된 계정') ||
        msg.includes('비활성화된 역할') ||
        msg.includes('역할 정보가 없습니다');
      if (isSessionInvalid) {
        window.location.href = REDIRECT_FORBIDDEN;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
