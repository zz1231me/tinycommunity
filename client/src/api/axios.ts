import axios from 'axios';
import { refreshToken } from './auth';
import { useAuth } from '../store/auth';
import { flagSessionExpired } from '../utils/sessionExpiry';
import { localizeTransportError } from './transportError';

const REDIRECT_LOGIN = '/';
const REDIRECT_FORBIDDEN = '/forbidden';
const AUTH_ENDPOINTS = ['/auth/me', '/auth/refresh'];

// 로그인 상태였는지는 store 의 user 가 아니라 localStorage 의 tokenInfo 로 본다.
// store 는 페이지 로드 때 비어 있어 콜드 리로드 직후 만료 안내를 놓친다.
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

// 갱신 후 store 의 만료시각을 맞춘다. 두면 폴링이 계속 갱신을 시도한다.
const syncTokenInfoFromRefresh = (refreshResponse: unknown): void => {
  try {
    const payload = (refreshResponse as { data?: { tokenInfo?: unknown } } | undefined)?.data;
    const tokenInfo = (payload as { tokenInfo?: unknown } | undefined)?.tokenInfo as
      { accessTokenExpiry: number; refreshTokenExpiry: number } | undefined;
    if (
      tokenInfo &&
      typeof tokenInfo.accessTokenExpiry === 'number' &&
      typeof tokenInfo.refreshTokenExpiry === 'number'
    ) {
      useAuth.getState().updateTokenInfo(tokenInfo);
    }
  } catch {
    // 다음 폴링이 보정하므로 무시한다.
  }
};
// 비밀글 검증은 401 이어도 로그인으로 보내지 않는다.
const SECRET_VERIFY_PATTERN = /\/posts\/[^/]+\/[^/]+\/verify/;

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
  headers: {
    'X-Requested-With': 'XMLHttpRequest', // CSRF 보호용 헤더
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) console.info(...args);
};

// 토큰 갱신 중복 요청 방지
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

api.interceptors.request.use(
  config => {
    devLog(`📤 API 요청: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  response => {
    devLog(
      `📥 API 응답: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`
    );
    return response;
  },
  async error => {
    localizeTransportError(error);
    const originalRequest = error.config;

    const isAuthEndpoint = AUTH_ENDPOINTS.some(ep => originalRequest?.url?.includes(ep));

    // 419 는 다시 발급받으면 되는 상태, 401 은 끝난 세션이다. 상태 코드만 본다.
    // 여기에 isAuthEndpoint 를 걸면 /auth/me 가 419 를 받을 때 갱신 없이 로그아웃된다.
    if (error.response?.status === 419 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        devLog('🔄 Access Token 만료 감지, 자동 갱신 시도...');

        try {
          const refreshResponse = await refreshToken();
          syncTokenInfoFromRefresh(refreshResponse);
          onRefreshed();

          return api(originalRequest);
        } catch (refreshError) {
          // 대기 중인 subscriber 가 영원히 기다리지 않도록 에러를 전파한다.
          onRefreshFailed(refreshError);
          if (!isAuthEndpoint) {
            redirectToLogin();
          }
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        return new Promise((resolve, reject) => {
          refreshSubscribers.push({
            resolve: () => resolve(api(originalRequest)),
            reject,
          });
        });
      }
    }

    if (error.response?.status === 401) {
      const isSecretVerify = SECRET_VERIFY_PATTERN.test(originalRequest?.url ?? '');
      if (!isAuthEndpoint && !isSecretVerify) {
        redirectToLogin();
      }
    }

    // 계정·역할 비활성화처럼 세션 자체가 무효일 때만 보낸다. 일반 권한 거부는 화면이 처리한다.
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

// 파일 업로드용 인스턴스
export const uploadApi = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 0, // 대용량 업로드라 제한을 두지 않는다
  headers: {
    'X-Requested-With': 'XMLHttpRequest', // CSRF 보호용 헤더
  },
});

// api 인스턴스의 isRefreshing 큐를 그대로 공유한다.
uploadApi.interceptors.response.use(
  response => response,
  async error => {
    localizeTransportError(error);
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
        return new Promise((resolve, reject) => {
          refreshSubscribers.push({
            resolve: () => resolve(uploadApi(error.config)),
            reject,
          });
        });
      }
    }

    if (error.response?.status === 401) {
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
