// 출근 알림(CheckInReminder)과 attendanceKeys.me 키·조회 옵션을 같게 유지해야 캐시가 갈리지 않는다.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { attendanceKeys } from '../../api/queryKeys';
import { fetchMyAttendance } from '../../api/attendance';
import { useFeature } from '../../store/features';
import { useAuth } from '../../store/auth';

export function AttendanceBadge() {
  const loggedIn = useAuth(s => s.isAuthenticated);
  const enabled = useFeature('tools.attendance') && loggedIn;

  const { data } = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
    enabled,
    staleTime: 5 * 60_000,
    // 밤새 열어 둔 탭이 어제 기록을 들고 있지 않도록 포커스 시 다시 읽는다.
    refetchOnWindowFocus: true,
  });

  if (!enabled) return null;

  // 아직 못 받았으면 깜빡이지 않는다.
  const loaded = data !== undefined;
  const record = data?.record ?? null;

  // 어제 미마감 기록(openPrevious)은 '오늘 출근'으로 치지 않는다.
  const notCheckedIn = loaded && record === null;
  const working = Boolean(record && !record.checkOutAt);

  const label = !loaded
    ? '출근 확인'
    : notCheckedIn
      ? '출근 확인 — 아직 출근을 찍지 않았습니다'
      : working
        ? '출근 확인 — 근무 중'
        : '출근 확인 — 퇴근 완료';

  return (
    <Link
      to="/dashboard/attendance"
      aria-label={label}
      title={label}
      className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <Clock
        className={`h-5 w-5 ${notCheckedIn ? 'text-amber-500 motion-safe:animate-pulse dark:text-amber-400' : ''}`}
      />
      {notCheckedIn && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 motion-safe:animate-pulse"
        />
      )}
    </Link>
  );
}
