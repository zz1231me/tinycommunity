// client/src/components/attendance/AttendanceReminder.tsx
// 기준 근무 시간 10분 전에 한 번 알린다.
//
// 앱 안에서만 알린다 — 안내창을 띄우고 브라우저 탭 제목을 깜빡인다.
// 다른 탭을 보고 있어도 제목이 움직여 눈에 걸린다.
//
// 서버를 반복해서 찌르지 않는다. 출근 시각과 기준 시간을 알면 언제 알릴지
// 계산할 수 있으므로, 남은 시간만 주기적으로 세어 본다.

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { attendanceKeys } from '../../api/queryKeys';
import { fetchMyAttendance } from '../../api/attendance';
import { useFeature } from '../../store/features';
import { formatClock, formatMinutes, minutesBetween } from '../../utils/attendance';
import { shouldNotify } from './reminderRule';

/** 남은 시간을 다시 세어 보는 간격 */
const CHECK_MS = 30_000;
/** 탭 제목이 번갈아 바뀌는 간격 */
const BLINK_MS = 1_000;

const seenKey = (workDate: string) => `attendanceNotice:${workDate}`;

function alreadyNoticed(workDate: string): boolean {
  try {
    return localStorage.getItem(seenKey(workDate)) === '1';
  } catch {
    return false;
  }
}

function markNoticed(workDate: string): void {
  try {
    localStorage.setItem(seenKey(workDate), '1');
  } catch {
    // localStorage 를 못 써도 알림 자체는 동작해야 한다 (그 세션에서 한 번 더 뜰 뿐)
  }
}

/** 알림이 떠 있는 동안 탭 제목을 번갈아 보여 준다 */
function useBlinkingTitle(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    let on = false;
    const timer = window.setInterval(() => {
      on = !on;
      document.title = on ? message : original;
    }, BLINK_MS);
    return () => {
      window.clearInterval(timer);
      // App 이 사이트 설정으로 제목을 다시 넣기 전까지의 값을 되돌린다
      document.title = original;
    };
  }, [active, message]);
}

export function AttendanceReminder() {
  const enabled = useFeature('tools.attendance');
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  // 같은 날 두 번 띄우지 않는다. localStorage 를 못 쓰는 경우를 위해 메모리에도 남긴다.
  const noticedRef = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
    enabled,
    // 출퇴근 화면과 같은 캐시를 쓴다. 여기서 자주 받아올 이유는 없다.
    staleTime: 5 * 60_000,
  });

  // 남은 시간은 시간이 흐르면 바뀐다 — 주기적으로 다시 계산한다
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setTick(t => t + 1), CHECK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const record = data?.record ?? data?.openPrevious ?? null;
  const working = Boolean(record && !record.checkOutAt);
  const standard = data?.policy.standardWorkMinutes ?? 0;

  const worked = working && record ? minutesBetween(record.checkInAt, new Date()) : 0;
  const remaining = standard - worked;

  useEffect(() => {
    if (!enabled || !record) return;
    const noticed =
      noticedRef.current === record.workDate || alreadyNoticed(record.workDate);
    if (!shouldNotify({ working, standardWorkMinutes: standard, workedMinutes: worked, alreadyNoticed: noticed })) {
      return;
    }

    noticedRef.current = record.workDate;
    markNoticed(record.workDate);
    setOpen(true);
    // tick 은 다시 계산하게 만드는 값일 뿐이라 의존성에 둔다
  }, [enabled, working, record, standard, worked, tick]);

  // 퇴근을 찍으면 알림도 닫는다
  useEffect(() => {
    if (!working) setOpen(false);
  }, [working]);

  useBlinkingTitle(open, '⏰ 퇴근 시간이 다 됐습니다');

  if (!open || !record) return null;

  const over = remaining <= 0;

  return (
    <ModalShell label="퇴근 시간 안내" onClose={() => setOpen(false)} className="w-full max-w-sm">
      <div className="p-5 text-center">
        <AlarmClock className="mx-auto h-8 w-8 text-primary-600 dark:text-primary-400" />
        <h2 className="card-title mt-3">
          {over ? '기준 근무 시간을 채웠습니다' : `퇴근 ${Math.max(1, remaining)}분 전입니다`}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="tabular-nums">{formatClock(record.checkInAt)}</span> 출근 · 지금까지{' '}
          {formatMinutes(worked)}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          기준 {formatMinutes(standard)}. 퇴근은 출근 확인 화면에서 직접 찍습니다.
        </p>
        <button type="button" onClick={() => setOpen(false)} className="btn-primary mt-4 w-full">
          확인
        </button>
      </div>
    </ModalShell>
  );
}
