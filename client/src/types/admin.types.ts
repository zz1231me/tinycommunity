// 관리자 페이지 공통 타입

export interface User {
  id: string;
  name: string;
  email?: string | null;
  roleId: string;
  isActive: boolean;
  isApproved?: boolean; // false=가입 승인 대기, true=승인됨(비활성화돼도 유지)
  lastLoginAt?: string | null;
  lastActiveAt?: string | null;
  lastLoginIp?: string | null;
  lastLoginDevice?: string | null;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  anonymizedName?: string;
  roleInfo?: {
    id: string;
    name: string;
  };
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

export interface Board {
  id: string;
  name: string;
  description: string;
  order: number;
  isActive: boolean;
  /** 업무용 게시판. 담당자·업무 상태를 쓴다. */
  taskEnabled?: boolean;
}

export interface BoardPermission {
  roleId: string;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export interface Event {
  id: number;
  title: string;
  start: string;
  end: string;
  location?: string;
  calendarId: string;
  category?: string | null;
  user: {
    id: string;
    name: string;
    roleInfo?: {
      id: string;
      name: string;
    };
  };
  createdAt: string;
}

export interface EventPermission {
  roleId: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  role?: {
    id: string;
    name: string;
  };
}

export interface SecurityLog {
  id: string;
  userId?: string;
  ipAddress: string;
  action: string;
  method: string;
  route: string;
  userAgent: string;
  status: string;
  details?: Record<string, unknown>;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface LoginHistoryRecord {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: 'success' | 'failed' | 'locked';
  failureReason?: string | null;
  createdAt: string;
}

export type AuditAction =
  | 'create_user'
  | 'update_user'
  | 'delete_user'
  | 'restore_user'
  | 'approve_user'
  | 'reject_user'
  | 'deactivate_user'
  | 'reset_password'
  | 'approve_password_reset'
  | 'reject_password_reset'
  | 'change_role'
  | 'create_board'
  | 'update_board'
  | 'delete_board'
  | 'create_role'
  | 'update_role'
  | 'delete_role'
  | 'update_permission'
  | 'delete_event'
  | 'update_event'
  | 'update_site_settings'
  | 'force_logout'
  | 'delete_security_log'
  | 'delete_error_log'
  | 'create_ip_rule'
  | 'update_ip_rule'
  | 'delete_ip_rule'
  | 'update_attendance_settings'
  // 일반 사용자도 남기는 행위(되돌릴 수 없는 삭제만)
  | 'delete_post'
  | 'delete_comment'
  | 'delete_wiki_page';

export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorName: string;
  action: AuditAction;
  // 서버의 AuditTargetType 과 같아야 한다.
  targetType:
    | 'user'
    | 'board'
    | 'role'
    | 'event'
    | 'setting'
    | 'security_log'
    | 'error_log'
    | 'ip_rule'
    | 'attendance'
    | 'post'
    | 'comment'
    | 'wiki';
  targetId?: string | null;
  targetName?: string | null;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface UserSessionRecord {
  id: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  lastActiveAt: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface PasswordResetRequestItem {
  id: string;
  userId: string; // 로그인 아이디
  name: string | null;
  code: string; // 복호화된 6자리 인증번호(관리자 전용)
  expiresAt: string;
  attempts: number;
  remainingAttempts: number;
  createdAt: string;
}

export type TabType =
  | 'users'
  | 'boards'
  | 'roles'
  | 'permissions'
  | 'password-reset-requests'
  | 'events'
  | 'bookmarks'
  | 'site-settings'
  | 'features'
  | 'appearance'
  | 'security-logs'
  | 'error-logs'
  | 'tags'
  | 'login-history'
  | 'dashboard'
  | 'audit-logs'
  | 'reports'
  | 'files'
  | 'ip-management'
  | 'board-managers'
  | 'custom-pages'
  | 'announcements'
  | 'attendance';

// 관리자 대시보드 통계(GET /admin/stats)
export interface AdminStatsBucket {
  key: string;
  count: number;
}
export interface AdminStats {
  summary: {
    totalUsers: number;
    activeUsers: number;
    pendingUsers: number;
    totalPosts: number;
    totalComments: number;
    totalBoards: number;
  };
  /** 운영자가 지금 처리해야 하는 항목 수. */
  pending: {
    userApprovals: number;
    reports: number;
    passwordResets: number;
  };
  /** boardActivity·topAuthors 가 보는 '최근' 의 기준 일수. */
  recentDays: number;
  /** 게시판별 활력. 최근 글이 많은 순. */
  boardActivity: {
    boardId: string;
    name: string;
    totalPosts: number;
    recentPosts: number;
  }[];
  /** 최근 기간의 상위 작성자(최대 5명). */
  topAuthors: { userId: string; name: string; count: number }[];
  signupsByMonth: AdminStatsBucket[];
  postsByMonth: AdminStatsBucket[];
  loginsByDay: AdminStatsBucket[];
  usersByRole: { role: string; count: number }[];
}
