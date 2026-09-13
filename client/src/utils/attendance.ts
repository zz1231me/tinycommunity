// client/src/utils/attendance.ts
// 출퇴근 화면과 관리자 화면이 같은 말로 표시하도록 모아 둔다.

import type { CheckInStatus, CheckOutStatus } from '../types/attendance.types';

/** 분 → "8시간 12분". 0 이면 "0분" */
export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '0분';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** ISO 시각 → "09:04" */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const checkInLabel: Record<CheckInStatus, string> = {
  normal: '정상',
  late: '지각',
};

export const checkOutLabel: Record<CheckOutStatus, string> = {
  normal: '정상',
  early: '조기 퇴근',
};

/** 오늘 날짜 (YYYY-MM-DD, 브라우저 기준) */
export function todayString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM 을 n개월 옮긴다 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
