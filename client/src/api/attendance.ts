// client/src/api/attendance.ts
import api from './axios';
import { unwrap } from './utils';
import type {
  AttendanceHistory,
  AttendancePolicy,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSummaryRow,
  ChecklistItem,
  TodayBoard,
} from '../types/attendance.types';

// ── 본인 ──────────────────────────────────────────────────────────────────

export const fetchMyAttendance = async (): Promise<AttendanceStatus> =>
  unwrap(await api.get('/attendance/me'));

export const fetchMyAttendanceHistory = async (month: string): Promise<AttendanceHistory> =>
  unwrap(await api.get(`/attendance/me/history?month=${encodeURIComponent(month)}`));

export const checkIn = async (payload: {
  responses: Array<{ itemId: number; checked: boolean }>;
  note?: string;
}): Promise<AttendanceRecord> => unwrap(await api.post('/attendance/check-in', payload));

export const checkOut = async (): Promise<AttendanceRecord> =>
  unwrap(await api.post('/attendance/check-out'));

// ── 퇴근 공격권·방어권 ─────────────────────────────────────────────────────
//
// 공격은 화면의 버튼만 잠근다. 기록되는 퇴근 시각은 실제로 누른 순간 그대로다 —
// 서버의 퇴근 경로는 이 기능을 쳐다보지도 않는다.

export interface AttackRules {
  cost: number;
  defendCost: number;
  /** 화면에서 버튼이 잠겨 보이는 시간(초) */
  blockSeconds: number;
  dailyLimit: number;
}

export interface IncomingAttack {
  id: number;
  attackerId: string;
  attackerName: string;
  expiresAt: string;
}

export interface AttackState {
  rules: AttackRules;
  balance: number;
  /** 지금 나에게 걸린 공격 (없으면 null) */
  incoming: IncomingAttack | null;
  usedToday: number;
  remainingToday: number;
}

export const fetchAttackState = async (): Promise<AttackState> =>
  unwrap(await api.get('/attendance/attack'));

export const sendAttack = async (
  targetId: string
): Promise<{ id: number; targetId: string; expiresAt: string }> =>
  unwrap(await api.post('/attendance/attack', { targetId }));

export const sendDefend = async (id: number): Promise<{ id: number }> =>
  unwrap(await api.post(`/attendance/attack/${id}/defend`));

// ── 관리자 ────────────────────────────────────────────────────────────────

export interface RecordQuery {
  from?: string;
  to?: string;
  userId?: string;
  page?: number;
  /** 한 번에 받을 건수. 서버 상한은 전체 100, 한 사람이면 366 */
  limit?: number;
}

export const fetchAttendanceRecords = async (
  query: RecordQuery
): Promise<{ records: AttendanceRecord[]; total: number; page: number; totalPages: number }> => {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.userId) params.set('userId', query.userId);
  params.set('page', String(query.page ?? 1));
  if (query.limit) params.set('limit', String(query.limit));
  return unwrap(await api.get(`/admin/attendance/records?${params.toString()}`));
};

export const fetchAttendanceToday = async (): Promise<TodayBoard> =>
  unwrap(await api.get('/admin/attendance/today'));

export const fetchAttendanceSummary = async (query: {
  from?: string;
  to?: string;
}): Promise<AttendanceSummaryRow[]> => {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return unwrap(await api.get(`/admin/attendance/summary?${params.toString()}`));
};

export const fetchAttendanceSettings = async (): Promise<{
  checklist: ChecklistItem[];
  policy: AttendancePolicy;
}> => unwrap(await api.get('/admin/attendance/settings'));

export const createChecklistItem = async (data: {
  label: string;
  description?: string;
  required?: boolean;
}): Promise<ChecklistItem> => unwrap(await api.post('/admin/attendance/checklist', data));

export const updateChecklistItem = async (
  id: number,
  data: Partial<Pick<ChecklistItem, 'label' | 'description' | 'required' | 'isActive' | 'order'>>
): Promise<ChecklistItem> => unwrap(await api.put(`/admin/attendance/checklist/${id}`, data));

export const reorderChecklist = async (ids: number[]): Promise<ChecklistItem[]> =>
  unwrap(await api.put('/admin/attendance/checklist/reorder', { ids }));

export const deleteChecklistItem = async (id: number): Promise<void> => {
  await api.delete(`/admin/attendance/checklist/${id}`);
};

export const updateAttendancePolicy = async (
  data: Partial<AttendancePolicy>
): Promise<AttendancePolicy> => unwrap(await api.put('/admin/attendance/policy', data));
