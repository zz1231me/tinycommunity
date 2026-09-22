// 관리자 전용 API
import api from './axios';
import { unwrap } from './utils';
import { User, PasswordResetRequestItem, AdminStats } from '../types/admin.types';

export const fetchAdminStats = (signal?: AbortSignal): Promise<AdminStats> =>
  api.get('/admin/stats', { signal }).then(unwrap);

export const fetchAdminUsers = (): Promise<User[]> => api.get('/admin/users').then(unwrap);

export const approveUser = (userId: string): Promise<void> =>
  api.patch(`/admin/users/${userId}/approve`).then(() => undefined);

export const rejectUser = (userId: string): Promise<void> =>
  api.delete(`/admin/users/${userId}/reject`).then(() => undefined);

export const deactivateUser = (userId: string): Promise<void> =>
  api.patch(`/admin/users/${userId}/deactivate`).then(() => undefined);

export const restoreUser = (userId: string): Promise<void> =>
  api.post(`/admin/users/${userId}/restore`).then(() => undefined);

export const fetchDeletedUsers = (): Promise<User[]> =>
  api.get('/admin/users/deleted').then(unwrap);

// 목록에는 복호화된 6자리 인증번호가 포함된다(관리자 전용).
export const fetchPasswordResetRequests = (): Promise<PasswordResetRequestItem[]> =>
  api.get('/admin/password-reset-requests').then(unwrap);

/** 인증번호를 전달한 뒤 목록에서 정리한다. */
export const dismissPasswordResetRequest = (id: string): Promise<void> =>
  api.delete(`/admin/password-reset-requests/${id}`).then(() => undefined);

export const fetchSecurityLogs = (params?: Record<string, string | number>, signal?: AbortSignal) =>
  api.get('/admin/security-logs', { params, signal }).then(unwrap);

/** 보안 로그 CSV 내보내기. 서버가 blob 을 내려준다. */
export const exportSecurityLogs = (): Promise<Blob> =>
  api.get('/admin/export/security-logs', { responseType: 'blob' }).then(res => res.data);

/** 보안 로그 삭제
 * - ids 지정 시 해당 로그만 삭제
 * - before 지정 시 해당 날짜 이전 삭제 (ISO string)
 * - 둘 다 없으면 전체 삭제
 */
export const deleteSecurityLogs = (
  options: { before?: string; ids?: string[] } = {}
): Promise<{ deleted: number }> =>
  api.delete('/admin/security-logs', { data: options }).then(unwrap);

export const fetchErrorLogs = (params?: Record<string, string | number>, signal?: AbortSignal) =>
  api.get('/admin/error-logs', { params, signal }).then(unwrap);

/** 에러 로그 삭제
 * - ids 지정 시 해당 로그만 삭제
 * - before + severity 조합 가능
 * - 둘 다 없으면 전체 삭제
 */
export const deleteErrorLogs = (
  options: { before?: string; severity?: string; ids?: string[]; all?: boolean } = {}
): Promise<{ deleted: number }> => api.delete('/admin/error-logs', { data: options }).then(unwrap);

export const fetchLoginHistory = (params?: Record<string, string | number>, signal?: AbortSignal) =>
  api.get('/admin/login-history', { params, signal }).then(unwrap);

export const fetchUserLoginHistory = (userId: string, params?: Record<string, string | number>) =>
  api.get(`/admin/users/${userId}/login-history`, { params }).then(unwrap);

/** 포인트 절반 날리기 기록. 익명은 당한 사람에게만 지키는 규칙이라 여기에는 공격자가 있다. */
export const fetchPointAttackLog = (
  params?: Record<string, string | number>,
  signal?: AbortSignal
) => api.get('/admin/point-attacks', { params, signal }).then(unwrap);

export const fetchAuditLogs = (params?: Record<string, string | number>, signal?: AbortSignal) =>
  api.get('/admin/audit-logs', { params, signal }).then(unwrap);

export const fetchUserAuditLogs = (userId: string, params?: Record<string, string | number>) =>
  api.get(`/admin/users/${userId}/audit-logs`, { params }).then(unwrap);

export const fetchUserSessions = (userId: string) =>
  api.get(`/admin/users/${userId}/sessions`).then(unwrap);

export const forceLogoutSession = (userId: string, sessionId: string): Promise<void> =>
  api.delete(`/admin/users/${userId}/sessions/${sessionId}`).then(() => undefined);

export const fetchWikiPermissions = (): Promise<{ roles: string[] }> =>
  api.get('/admin/wiki/permissions').then(unwrap);

export const updateWikiPermissions = (roles: string[]): Promise<{ roles: string[] }> =>
  api.put('/admin/wiki/permissions', { roles }).then(unwrap);
