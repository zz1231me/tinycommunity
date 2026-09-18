// client/src/components/attendance/AttendanceBadge.tsx
// 헤더의 출근 아이콘.
//
// 전에는 출근을 찍으려면 프로필로 들어가야 했다. 하루에 한 번 하는 일인데 경로가 깊어
// 잊기 쉽다 — 알림 옆에 두고, 아직 안 찍었으면 눈에 띄게 한다.
//
// 네트워크 요청을 늘리지 않는다. AttendanceReminder 가 App 최상위에 있어 이미
// attendanceKeys.me 를 구독하고 있고(staleTime 5분), 여기서 같은 키를 쓰면 React Query 가
// 구독을 합쳐 캐시를 그대로 읽는다. 조회 옵션도 그쪽과 같게 맞춰 둔다 — 한쪽만 다르면
// 먼저 마운트되는 쪽의 설정이 이기고 다른 쪽 의도가 조용히 사라진다.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { attendanceKeys } from '../../api/queryKeys';
import { fetchMyAttendance } from '../../api/attendance';
import { useFeature } from '../../store/features';
import { useAuth } from '../../store/auth';

export function AttendanceBadge() {
  const loggedIn = useAuth(s => s.isAuthenticated);
  // AttendanceReminder 와 같은 조건 — 로그인 화면에서까지 물어볼 이유가 없다
  const enabled = useFeature('tools.attendance') && loggedIn;

  const { data } = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
    enabled,
    staleTime: 5 * 60_000,
    // 창으로 돌아오면 다시 읽는다(앱 기본값은 끔). 어제 퇴근한 채 밤새 열어 둔 탭은 아침에도
    // 어제 기록을 들고 있어, '아직 출근 안 함' 알림 대신 '퇴근 완료' 가 떠 있었다.
    // 이 배지는 모든 화면 머리에 있으므로, 같은 키를 쓰는 출근 알림들도 함께 새로 읽힌다.
    refetchOnWindowFocus: true,
  });

  if (!enabled) return null;

  // 아직 못 받았으면 조용히 둔다. 모르는 상태에서 깜빡이면 허위 경보다.
  const loaded = data !== undefined;
  const record = data?.record ?? null;

  // 어제 미마감 기록(openPrevious)은 '오늘 출근' 으로 치지 않는다.
  // reminderRule 에 적힌 판단과 같다 — 어제 것을 오늘로 세면 엉뚱한 안내가 나간다.
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
      {/*
        motion-safe: 움직임을 줄이도록 설정한 사용자에게는 깜빡이지 않는다.
        헤더에서 계속 깜빡이는 요소는 그 설정을 켠 사람에게 특히 거슬린다.
      */}
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
