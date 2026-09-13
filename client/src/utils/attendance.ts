// client/src/utils/attendance.ts
// 출퇴근 화면과 관리자 화면이 같은 말로 표시하도록 모아 둔다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

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

/** "2026-09" → "2026년 9월" */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}년 ${Number(m)}월`;
}

/** "2026-09-13" → "일" */
export function weekdayOf(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
}

/** 주말이면 색을 달리해 한 달을 훑을 때 주 단위가 보이게 한다 */
export function weekdayTone(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'text-slate-400';
  if (d.getDay() === 0) return 'text-rose-400';
  if (d.getDay() === 6) return 'text-sky-400';
  return 'text-slate-400';
}

/** "2026-09-13" → "09.13" */
export function formatDay(day: string): string {
  return day.slice(5).replace('-', '.');
}

/** 그 달의 날짜 수 */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** 두 시각 사이의 분 */
export function minutesBetween(from: string, to: Date): number {
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.round((to.getTime() - start) / 60000));
}
