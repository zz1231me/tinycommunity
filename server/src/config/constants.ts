export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
  GUEST: 'guest',
} as const;

export const isAdminOrManager = (role: string): boolean =>
  role === ROLES.ADMIN || role === ROLES.MANAGER;

// 예약된 게시판 ID (시스템 경로와 충돌 방지)
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
  // /api/boards 하위 라우트 세그먼트. 같은 이름의 게시판 ID 가 라우트를 가린다.
  'check',
  'accessible',
  'personal',
  'setup-dummy',
];

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: DEFAULT_PAGE_SIZE,
  MAX_LIMIT: MAX_PAGE_SIZE,
} as const;

// 비밀글 비밀번호를 직접 맞혀 보는 요청만 막는다(bruteForceGuard).
export const RATE_LIMIT = {
  SECRET_POST_WINDOW_MS: 5 * 60 * 1000,
  SECRET_POST_MAX: 5,
  /** 로그인 실패만 센다. 한도가 낮으면 IP 를 공유하는 사무실 전체가 막히고, 한 계정 반복 시도는 계정 잠금이 따로 막는다. */
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_FAIL_MAX: 50,
  REGISTER_WINDOW_MS: 60 * 60 * 1000,
  REGISTER_MAX: 10,
} as const;

// Cache TTL (초)
export const CACHE_TTL = {
  DEFAULT: 300,
  SITE_SETTINGS: 600,
  BOARDS: 300,
  USERS: 180,
} as const;

// Cache 만료 체크 주기 (초)
export const CACHE_CHECK_PERIOD = 60;

export const JWT_ALGORITHM = 'HS256' as const;
