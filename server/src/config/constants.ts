// server/src/config/constants.ts - 앱 전역 상수

// 사용자 역할 상수 (매직 스트링 방지)
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
  GUEST: 'guest',
} as const;

/** admin 또는 manager 역할인지 확인 */
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
  // /api/boards 하위 라우트 리터럴 세그먼트 — 동명 게시판 ID가 라우트를 가리는 것 방지
  // (예: id가 'check'면 GET /check/can-manage 가 /check/:boardType 에 먹힘)
  'check',
  'accessible',
  'personal',
  'setup-dummy',
];

// 페이지네이션
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: DEFAULT_PAGE_SIZE,
  MAX_LIMIT: MAX_PAGE_SIZE,
} as const;

// 비밀글 비밀번호 확인 횟수 — 일반적인 요청 수 제한은 걷어냈고, 비밀을
// 직접 맞혀 보는 요청만 막는다(bruteForceGuard).
export const RATE_LIMIT = {
  SECRET_POST_WINDOW_MS: 5 * 60 * 1000, // 5분
  SECRET_POST_MAX: 5,
  /**
   * 로그인 실패만 센다(성공은 세지 않는다).
   *
   * 한도를 넉넉히 둔 이유가 있다. 한 번 한도에 닿으면 그 IP 에서는 비밀번호가 맞아도
   * 15분 동안 429 다 — 세는 것을 건너뛰는 것과 막히지 않는 것은 다르다. 사무실처럼
   * 여러 사람이 한 IP 를 쓰는 곳에서 한도가 낮으면, 막히는 것은 공격자가 아니라 출근이다.
   *
   * 반대로 공격 쪽은 한도를 올려도 거의 손해가 없다. 비밀번호 하나를 수천 개의 아이디에
   * 뿌리는 짓(password spraying)은 시도가 수천 번이라 50에서든 20에서든 똑같이 막힌다.
   * 한 계정을 계속 두드리는 것은 계정 잠금(5회 → 30분)이 따로 막는다.
   */
  LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15분
  LOGIN_FAIL_MAX: 50,
  REGISTER_WINDOW_MS: 60 * 60 * 1000, // 1시간
  REGISTER_MAX: 10,
} as const;

// Cache TTL (초)
export const CACHE_TTL = {
  DEFAULT: 300, // 5분
  SITE_SETTINGS: 600, // 10분
  BOARDS: 300, // 5분
  USERS: 180, // 3분
} as const;

// Cache 만료 체크 주기 (초)
export const CACHE_CHECK_PERIOD = 60;

// JWT 알고리즘
export const JWT_ALGORITHM = 'HS256' as const;
