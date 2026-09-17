// client/src/api/queryKeys.ts
// React Query 캐시 키를 한곳에 모은다. 뮤테이션 쪽에서 무효화할 때 문자열을
// 손으로 맞추면 오타 하나로 조용히 갱신이 안 되므로, 키는 항상 여기서 가져온다.
//
// 규칙: all → 해당 도메인 전체 무효화용 접두사, 나머지는 그 아래 파생.
//   queryClient.invalidateQueries({ queryKey: adminKeys.roles.all })

/** 메시지 */
export const messageKeys = {
  all: ['messages'] as const,
  conversations: ['messages', 'conversations'] as const,
  conversation: (id: string) => ['messages', 'conversation', id] as const,
  unread: ['messages', 'unread'] as const,
} as const;

/** 담당자·업무 상태, 읽음 확인, 첨부 버전 */
export const taskKeys = {
  all: ['tasks'] as const,
  statuses: ['tasks', 'statuses'] as const,
  mine: (status: string) => ['tasks', 'mine', status] as const,
  readers: (boardType: string, postId: string) => ['tasks', 'readers', boardType, postId] as const,
  attachmentVersions: (boardType: string, postId: string) =>
    ['tasks', 'attachment-versions', boardType, postId] as const,
  activity: (boardType: string, postId: string) =>
    ['tasks', 'activity', boardType, postId] as const,
} as const;

/** 구독·팔로우, 알림 설정, 다른 사람 프로필 */
export const socialKeys = {
  all: ['social'] as const,
  subscriptions: ['social', 'subscriptions'] as const,
  subscriptionStatus: (targetType: string, targetId: string) =>
    ['social', 'subscriptions', targetType, targetId] as const,
  notificationSettings: ['social', 'notification-settings'] as const,
  profile: (userId: string) => ['social', 'profile', userId] as const,
} as const;

/** 게시판 — 게시판 정보와 글 목록 */
export const boardKeys = {
  all: ['boards'] as const,
  info: (boardType: string) => ['boards', 'info', boardType] as const,
  /** 목록은 필터가 바뀌면 다른 결과다 — 조건을 통째로 키에 넣는다.
   *  이렇게 두면 조건을 바꿨을 때 이전 조건의 응답이 늦게 도착해도 화면에 반영되지 않는다. */
  posts: (boardType: string, params: Record<string, unknown>) =>
    ['boards', 'posts', boardType, params] as const,
} as const;

/**
 * 게시판 목록의 placeholderData 규칙.
 *
 * 페이지·검색·태그를 바꿀 때는 이전 목록을 잠깐 그대로 둬서 화면이 비지 않게 한다.
 * 다만 게시판 자체가 바뀌면 버린다 — 안 그러면 B 게시판 머리글 아래 A 게시판 글이 잠깐 보인다.
 * boardKeys.posts 의 3번째 칸이 boardType 이다.
 */
export function keepIfSameBoard<T>(
  prev: T | undefined,
  prevKey: readonly unknown[] | undefined,
  boardType: string | undefined
): T | undefined {
  return prevKey?.[2] === boardType ? prev : undefined;
}

/** 마이페이지 — 내 글·내 댓글 (접속 기록·세션 탭은 아직 useState 로 관리한다) */
export const profileKeys = {
  all: ['profile'] as const,
  posts: (page: number) => ['profile', 'posts', page] as const,
  comments: (page: number) => ['profile', 'comments', page] as const,
} as const;

/** 작성 중인 글의 임시저장 */
export const draftKeys = {
  all: ['drafts'] as const,
  detail: (id: string) => ['drafts', id] as const,
} as const;

/** 탐색·참여(인기글·태그·스크랩) — 관리자 화면과 무효화 범위가 겹치지 않아 따로 둔다 */
export const discoveryKeys = {
  all: ['discovery'] as const,
  popular: (period: string) => ['discovery', 'popular', period] as const,
  related: (boardType: string, postId: string) =>
    ['discovery', 'related', boardType, postId] as const,
  tagCloud: ['discovery', 'tag-cloud'] as const,
  postsByTag: (tagId: number, page: number) => ['discovery', 'tag-posts', tagId, page] as const,
  scraps: {
    all: ['discovery', 'scraps'] as const,
    list: (page: number) => ['discovery', 'scraps', 'list', page] as const,
    status: (boardType: string, postId: string) =>
      ['discovery', 'scraps', 'status', boardType, postId] as const,
  },
} as const;

/** 출퇴근 — 내 오늘 상태와 월별 기록 */
export const attendanceKeys = {
  all: ['attendance'] as const,
  me: ['attendance', 'me'] as const,
  history: (month: string) => ['attendance', 'history', month] as const,
} as const;

export const adminKeys = {
  stats: {
    all: ['admin', 'stats'] as const,
  },
  roles: {
    all: ['admin', 'roles'] as const,
  },
  users: {
    all: ['admin', 'users'] as const,
  },
  boards: {
    all: ['admin', 'boards'] as const,
  },
  events: {
    all: ['admin', 'events'] as const,
  },
  tags: {
    byBoard: (boardId: string | null) => ['admin', 'tags', { boardId }] as const,
  },
  userActivity: {
    all: (userId: string) => ['admin', 'user-activity', userId] as const,
    loginHistory: (userId: string, page: number) =>
      ['admin', 'user-activity', userId, 'login-history', page] as const,
    auditLogs: (userId: string, page: number) =>
      ['admin', 'user-activity', userId, 'audit-logs', page] as const,
    sessions: (userId: string) => ['admin', 'user-activity', userId, 'sessions'] as const,
    deniedAttempts: (userId: string, page: number) =>
      ['admin', 'user-activity', userId, 'denied-attempts', page] as const,
  },
  customPages: {
    all: ['admin', 'custom-pages'] as const,
  },
  files: {
    all: ['admin', 'files'] as const,
    list: (params: Record<string, unknown>) => ['admin', 'files', 'list', params] as const,
  },
  reports: {
    all: ['admin', 'reports'] as const,
    list: (params: Record<string, unknown>) => ['admin', 'reports', 'list', params] as const,
    stats: ['admin', 'reports', 'stats'] as const,
  },
  ipRules: {
    all: ['admin', 'ip-rules'] as const,
    list: (type: string) => ['admin', 'ip-rules', 'list', type] as const,
    stats: ['admin', 'ip-rules', 'stats'] as const,
  },
  bookmarks: {
    all: ['admin', 'bookmarks'] as const,
  },
  announcements: {
    all: ['admin', 'announcements'] as const,
  },
  passwordResets: {
    all: ['admin', 'password-resets'] as const,
  },
  boardManagers: {
    all: ['admin', 'board-managers'] as const,
  },
  features: {
    all: ['admin', 'features'] as const,
  },
  attendance: {
    all: ['admin', 'attendance'] as const,
    today: ['admin', 'attendance', 'today'] as const,
    records: (params: Record<string, unknown>) =>
      ['admin', 'attendance', 'records', params] as const,
    summary: (params: Record<string, unknown>) =>
      ['admin', 'attendance', 'summary', params] as const,
    settings: ['admin', 'attendance', 'settings'] as const,
  },
  logs: {
    // 로그 4종(보안/감사/로그인/에러)은 필터 조건이 키에 들어간다.
    all: ['admin', 'logs'] as const,
    list: (kind: string, params: Record<string, unknown>) =>
      ['admin', 'logs', kind, params] as const,
  },
} as const;
