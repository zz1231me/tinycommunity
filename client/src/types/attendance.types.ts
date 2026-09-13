// client/src/types/attendance.types.ts

export type CheckInStatus = 'normal' | 'late';
export type CheckOutStatus = 'normal' | 'early';

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
  checkInStatus: CheckInStatus;
  checkOutAt: string | null;
  checkOutStatus: CheckOutStatus | null;
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
  workStartTime: string;
  workEndTime: string;
  graceMinutes: number;
  requireChecklist: boolean;
}

export interface AttendanceStatus {
  workDate: string;
  record: AttendanceRecord | null;
  checklist: ChecklistItem[];
  policy: AttendancePolicy;
}

export interface AttendanceSummaryRow {
  userId: string;
  userName: string;
  days: number;
  lateDays: number;
  earlyLeaveDays: number;
  totalMinutes: number;
  lastWorkDate: string | null;
}

export interface AttendanceHistory {
  month: string;
  records: AttendanceRecord[];
  summary: {
    days: number;
    lateDays: number;
    earlyLeaveDays: number;
    totalMinutes: number;
    lastWorkDate: string | null;
  };
}
