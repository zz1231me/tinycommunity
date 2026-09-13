// client/src/types/attendance.types.ts

/** 출근 시점에 찍어 둔 확인 내용. 항목이 나중에 바뀌어도 이 값은 그대로다. */
export interface ChecklistAnswer {
  itemId: number;
  label: string;
  required: boolean;
  checked: boolean;
}

export interface AttendanceRecord {
  id: number;
  userId: string;
  /** 관리자 목록에서만 채워진다 */
  userName?: string;
  workDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  workMinutes: number | null;
  note: string;
  checklist: ChecklistAnswer[];
}

export interface ChecklistItem {
  id: number;
  label: string;
  description: string;
  required: boolean;
  order: number;
  isActive: boolean;
}

export interface AttendancePolicy {
  /** 하루 기준 근무 시간(분) */
  standardWorkMinutes: number;
  requireChecklist: boolean;
}

export interface AttendanceStatus {
  workDate: string;
  record: AttendanceRecord | null;
  checklist: ChecklistItem[];
  policy: AttendancePolicy;
}

export interface AttendanceSummary {
  days: number;
  totalMinutes: number;
  /** 퇴근까지 찍은 날의 평균 */
  averageMinutes: number;
  /** 퇴근을 찍지 않은 날 수 */
  openDays: number;
  lastWorkDate: string | null;
}

export interface AttendanceSummaryRow extends AttendanceSummary {
  userId: string;
  userName: string;
}

export interface AttendanceHistory {
  month: string;
  records: AttendanceRecord[];
  summary: AttendanceSummary;
  policy: AttendancePolicy;
}

export type TodayState = 'working' | 'done' | 'absent';

export interface TodayRow {
  userId: string;
  userName: string;
  state: TodayState;
  checkInAt: string | null;
  checkOutAt: string | null;
  /** 퇴근 전이면 지금까지 흐른 시간 */
  minutes: number | null;
  checkedCount: number;
  checklistCount: number;
}

export interface TodayBoard {
  workDate: string;
  rows: TodayRow[];
}
