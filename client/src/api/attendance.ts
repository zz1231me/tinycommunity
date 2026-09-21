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

/** 방금 누른 퇴근을 되돌린다. 누른 뒤 10분 안에만 된다 */
export const undoCheckOut = async (): Promise<AttendanceRecord> =>
  unwrap(await api.post('/attendance/check-out/undo'));

// 공격은 화면의 퇴근 버튼만 잠근다. 기록되는 퇴근 시각에는 영향이 없다.

/**
 * 공격의 종류.
 *  chaos: 퇴근 버튼이 잠시 도망다니고 깜빡인다 (막지는 않는다)
 *  hide:  퇴근 버튼이 잠시 보이지 않는다
 *  quiz:  퇴근 버튼을 누르면 계산 문제를 맞혀야 한다
 */
export type AttackKind = 'chaos' | 'hide' | 'quiz';

/** 공격 종류의 아이콘과 이름 */
export const ATTACK_FACE: Record<AttackKind, string> = { chaos: '🌀', hide: '🙈', quiz: '🧮' };
export const ATTACK_LABEL: Record<AttackKind, string> = {
  chaos: '퇴근 방해',
  hide: '버튼 숨기기',
  quiz: '문제 내기',
};

export interface AttackRules {
  cost: number;
  hideCost: number;
  defendCost: number;
  /** chaos: 퇴근 버튼이 말을 안 듣는 시간(초) */
  blockSeconds: number;
  /** hide: 퇴근 버튼이 보이지 않는 시간(초) */
  hideSeconds: number;
  dailyLimit: number;
  /** 한 사람에게 한꺼번에 쌓일 수 있는 공격 수 */
  maxStack: number;
}

export interface IncomingAttack {
  id: number;
  attackerId: string;
  attackerName: string;
  kind: AttackKind;
  /** 이 공격이 시작되는 시각. 쌓인 공격은 앞 것이 끝나야 시작한다 */
  startsAt: string;
  expiresAt: string;
}

export interface AttackState {
  /**
   * 서버가 응답을 만든 시각. 화면은 자기 시계와의 차이로 남은 시간을 센다.
   * 없으면(옛 서버) 차이를 0 으로 둔다.
   */
  now?: string;
  rules: AttackRules;
  balance: number;
  /** 지금 나에게 걸린 공격, 줄의 맨 앞 (없으면 null) */
  incoming: IncomingAttack | null;
  /** 쌓여 있는 공격 전부, 차례대로 */
  queue: IncomingAttack[];
  usedToday: number;
  remainingToday: number;
}

export const fetchAttackState = async (): Promise<AttackState> =>
  unwrap(await api.get('/attendance/attack'));

export const sendAttack = async (body: {
  targetId: string;
  kind: AttackKind;
}): Promise<{
  id: number;
  targetId: string;
  kind: AttackKind;
  /** 이 공격이 실제로 걸리기 시작하는 시각. 앞에 쌓인 것이 있으면 나중이다 */
  startsAt: string;
  expiresAt: string;
  /** 이 공격을 포함해 상대에게 쌓인 공격 수 */
  stack: number;
}> => unwrap(await api.post('/attendance/attack', body));

export const sendDefend = async (id: number): Promise<{ id: number }> =>
  unwrap(await api.post(`/attendance/attack/${id}/defend`));

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
