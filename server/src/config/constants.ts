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
  /**
   * 포인트를 움직이는 요청(뽑기·대결·공격). 한 사람 기준.
   * 하루 횟수 제한과는 다른 것을 막는다 — 횟수는 지켜지지만, 한꺼번에 몰아치면 같은 잔액 행을
   * 두고 트랜잭션이 줄을 서다 연결이 바닥나 사이트 전체가 응답하지 못한다.
   * 사람이 누르는 속도보다 넉넉하되(10초에 15회) 폭주는 막는 선이다.
   */
  POINT_SPEND_WINDOW_MS: 10 * 1000,
  POINT_SPEND_MAX: 15,
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
