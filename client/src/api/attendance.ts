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

/**
 * 공격의 종류.
 *  · chaos — 잠깐 동안 퇴근 버튼이 도망다니고 깜빡인다 (막지는 않는다)
 *  · hide  — 잠깐 동안 퇴근 버튼이 아예 보이지 않는다 (그동안은 누를 수 없다)
 */
export type AttackKind = 'chaos' | 'hide';

/** 공격 종류의 얼굴과 이름 — 출근 화면의 안내 줄·포인트 탭의 경고 띠·공격 패널이 함께 쓴다 */
export const ATTACK_FACE: Record<AttackKind, string> = { chaos: '🌀', hide: '🙈' };
export const ATTACK_LABEL: Record<AttackKind, string> = { chaos: '퇴근 방해', hide: '버튼 숨기기' };

export interface AttackRules {
  cost: number;
  hideCost: number;
  defendCost: number;
  /** 퇴근 버튼이 말을 안 듣는 시간(초) — chaos */
  blockSeconds: number;
  /** 퇴근 버튼이 보이지 않는 시간(초) — hide */
  hideSeconds: number;
  dailyLimit: number;
  /** 한 사람에게 한꺼번에 쌓일 수 있는 공격 수 */
  maxStack: number;
}

export interface IncomingAttack {
  id: number;
  attackerId: string;
  attackerName: string;
  /** 흔들지, 감출지를 이것으로 가른다 */
  kind: AttackKind;
  /** 이 공격이 시작되는(된) 시각 — 쌓인 공격은 앞 것이 끝나야 시작한다 */
  startsAt: string;
  expiresAt: string;
}

export interface AttackState {
  rules: AttackRules;
  balance: number;
  /** 지금 나에게 걸린 공격 — 줄의 맨 앞 (없으면 null) */
  incoming: IncomingAttack | null;
  /** 쌓여 있는 공격 전부, 차례대로. 길이가 곧 퇴근 버튼이 얼마나 사나운지다. */
  queue: IncomingAttack[];
  usedToday: number;
  remainingToday: number;
}

export const fetchAttackState = async (): Promise<AttackState> =>
  unwrap(await api.get('/attendance/attack'));

export const sendAttack = async (body: {
  targetId: string;
  kind: AttackKind;
}): Promise<{ id: number; targetId: string; kind: AttackKind; expiresAt: string }> =>
  unwrap(await api.post('/attendance/attack', body));

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
