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

// ── 관리자 ────────────────────────────────────────────────────────────────

export interface RecordQuery {
  from?: string;
  to?: string;
  userId?: string;
  page?: number;
}

export const fetchAttendanceRecords = async (
  query: RecordQuery
): Promise<{ records: AttendanceRecord[]; total: number; page: number; totalPages: number }> => {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.userId) params.set('userId', query.userId);
  params.set('page', String(query.page ?? 1));
  return unwrap(await api.get(`/admin/attendance/records?${params.toString()}`));
};

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

export const deleteChecklistItem = async (id: number): Promise<void> => {
  await api.delete(`/admin/attendance/checklist/${id}`);
};

export const updateAttendancePolicy = async (
  data: Partial<AttendancePolicy>
): Promise<AttendancePolicy> => unwrap(await api.put('/admin/attendance/policy', data));
