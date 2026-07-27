// server/src/config/constants.ts - 앱 전역 상수

// ✅ 사용자 역할 상수 (매직 스트링 방지)
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
  GUEST: 'guest',
} as const;

/** admin 또는 manager 역할인지 확인 */
export const isAdminOrManager = (role: string): boolean =>
  role === ROLES.ADMIN || role === ROLES.MANAGER;

// ✅ 예약된 게시판 ID (시스템 경로와 충돌 방지)
export const RESERVED_BOARD_IDS = [
  'admin',
  'api',
  'auth',
  'uploads',
  'static',
  'public',
  'login',
  'logout',
  'register',
  'dashboard',
  'settings',
  'health',
  'metrics',
  'status',
  'ws',
  'socket',
  // /api/boards 하위 라우트 리터럴 세그먼트 — 동명 게시판 ID가 라우트를 가리는 것 방지
  // (예: id가 'check'면 GET /check/can-manage 가 /check/:boardType 에 먹힘)
  'check',
  'accessible',
  'personal',
  'setup-dummy',
];

// ✅ 페이지네이션
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: DEFAULT_PAGE_SIZE,
  MAX_LIMIT: MAX_PAGE_SIZE,
} as const;

// ✅ Rate Limiting 창 및 최대 요청 수 (ms)
export const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15분
  API_MAX: 200,
  AUTH_MAX_PROD: 10,
  AUTH_MAX_DEV: 50,
  ADMIN_MAX: 100,
  UPLOAD_WINDOW_MS: 60 * 60 * 1000, // 1시간
  UPLOAD_MAX: 20,
  SECRET_POST_WINDOW_MS: 5 * 60 * 1000, // 5분
  SECRET_POST_MAX: 5,
  DOWNLOAD_WINDOW_MS: 60 * 60 * 1000, // 1시간
  DOWNLOAD_MAX: 100,
} as const;

// ✅ Cache TTL (초)
export const CACHE_TTL = {
  DEFAULT: 300, // 5분
  SITE_SETTINGS: 600, // 10분
  BOARDS: 300, // 5분
  USERS: 180, // 3분
} as const;

// ✅ Cache 만료 체크 주기 (초)
export const CACHE_CHECK_PERIOD = 60;

// ✅ JWT 알고리즘
export const JWT_ALGORITHM = 'HS256' as const;
