export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
  GUEST: 'guest',
} as const;

export const isAdminOrManager = (role: string): boolean =>
  role === ROLES.ADMIN || role === ROLES.MANAGER;

/**
 * 관리자가 올릴 수 있는 파일 한도의 천장(MB).
 *
 * 이 숫자 하나로 끝나지 않는다. 함께 맞춰야 하는 것들 —
 *   nginx  client_max_body_size (nginx.conf · nginx.docker.conf)
 *          더 작으면 Express 에 닿기도 전에 413 으로 끊긴다
 *   DB     첨부 크기 컬럼은 BIGINT 여야 한다. 부호 있는 INTEGER 는
 *          2,147,483,647 바이트(2047.99MiB)에서 넘친다
 *   Node   requestTimeout. 3GB 를 한 시간에 올리려면 약 6.8Mbps 가 필요하다
 * 어긋나지 않는지는 uploadSizeCeiling 검사가 본다.
 */
export const MAX_FILE_SIZE_MB_CEILING = 3072;

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
