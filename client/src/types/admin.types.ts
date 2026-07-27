// 관리자 페이지 공통 타입 정의

export interface User {
  id: string;
  name: string;
  roleId: string;
  isActive: boolean;
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
  | 'delete_ip_rule';

export interface AuditLogRecord {
  id: string;
  adminId: string;
  adminName: string;
  action: AuditAction;
  targetType:
    | 'user'
    | 'board'
    | 'role'
    | 'event'
    | 'setting'
    | 'security_log'
    | 'error_log'
    | 'ip_rule';
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
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export type TabType =
  | 'users'
  | 'boards'
  | 'roles'
  | 'permissions'
  | 'password-reset-requests'
  | 'events'
  | 'bookmarks'
  | 'rate-limits'
  | 'site-settings'
  | 'security-logs'
  | 'error-logs'
  | 'tags'
  | 'login-history'
  | 'audit-logs'
  | 'reports'
  | 'files'
  | 'ip-management'
  | 'board-managers';
