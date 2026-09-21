// client/src/components/attendance/AttendanceReminder.tsx
// 기준 근무 시간 10분 전에 한 번, 기준 시간이 됐을 때 한 번 더 알린다.
// 10분 전 한 번만 띄우면 하던 일을 마저 하다가 잊는다.
//
// 앱 안에서만 알린다 — 안내창을 띄우고 브라우저 탭 제목을 깜빡인다.
// 다른 탭을 보고 있어도 제목이 움직여 눈에 걸린다.
//
// 서버를 반복해서 찌르지 않는다. 출근 시각과 기준 시간을 알면 언제 알릴지
// 계산할 수 있으므로, 남은 시간만 주기적으로 세어 본다.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, LogOut } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { useBlinkingTitle } from './useBlinkingTitle';
import { attendanceKeys } from '../../api/queryKeys';
import { checkOut as requestCheckOut, fetchMyAttendance } from '../../api/attendance';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { useFeature } from '../../store/features';
import { useSubmitLock } from '../../hooks/useSubmitLock';
import { useAuth } from '../../store/auth';
import { formatClock, formatMinutes, minutesBetween } from '../../utils/attendance';
import { reminderRecord, notifyStage, type NoticeStage } from './reminderRule';

/** 남은 시간을 다시 세어 보는 간격 */
const CHECK_MS = 30_000;
/** 탭 제목이 번갈아 바뀌는 간격 */

const seenKey = (workDate: string, stage: NoticeStage) => `attendanceNotice:${workDate}:${stage}`;
/** 단계를 나누기 전에 쓰던 표시 — 하루에 하나였다 */
const legacyKey = (workDate: string) => `attendanceNotice:${workDate}`;

function alreadyNoticed(workDate: string, stage: NoticeStage): boolean {
  try {
    if (localStorage.getItem(seenKey(workDate, stage)) === '1') return true;
    // 예전에는 하루 한 번만 알렸다. 오늘 이미 그 알림을 본 사람에게 배포 직후 같은
    // 10분 전 알림이 한 번 더 뜨지 않도록, 옛 표시는 '10분 전을 봤다' 로 읽는다.
    return stage === 'before' && localStorage.getItem(legacyKey(workDate)) === '1';
  } catch {
    return false;
  }
}

function markNoticed(workDate: string, stage: NoticeStage): void {
  try {
    localStorage.setItem(seenKey(workDate, stage), '1');
  } catch {
    // localStorage 를 못 써도 알림 자체는 동작해야 한다 (그 세션에서 한 번 더 뜰 뿐)
  }
}

export function AttendanceReminder() {
  const queryClient = useQueryClient();
  const loggedIn = useAuth(s => s.isAuthenticated);
  // 로그인 화면에서까지 물어볼 이유가 없다
  const enabled = useFeature('tools.attendance') && loggedIn;
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  // 같은 단계를 두 번 띄우지 않는다. localStorage 를 못 쓰는 경우를 위해 메모리에도 남긴다.
  const noticedRef = useRef<Set<string>>(new Set());

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

  // 오늘 기록만 본다. 이유는 reminderRecord 에 적어 두었다.
  const record = reminderRecord(data);
  const working = Boolean(record && !record.checkOutAt);
  const standard = data?.policy.standardWorkMinutes ?? 0;

  const worked = working && record ? minutesBetween(record.checkInAt, new Date()) : 0;
  const remaining = standard - worked;

  useEffect(() => {
    if (!enabled || !record) return;
    const seen = (stage: NoticeStage) =>
      noticedRef.current.has(`${record.workDate}:${stage}`) ||
      alreadyNoticed(record.workDate, stage);

    const stage = notifyStage({
      working,
      standardWorkMinutes: standard,
      workedMinutes: worked,
      noticedBefore: seen('before'),
      noticedDue: seen('due'),
      noticedLate: seen('late'),
    });
    if (!stage) return;

    noticedRef.current.add(`${record.workDate}:${stage}`);
    markNoticed(record.workDate, stage);
    setOpen(true);
    // tick 은 다시 계산하게 만드는 값일 뿐이라 의존성에 둔다
  }, [enabled, working, record, standard, worked, tick]);

  // 퇴근을 찍으면 알림도 닫는다.
  // 로그아웃해도 닫는다 — 화면만 바뀌고 이 컴포넌트는 그대로 살아 있어서,
  // 열려 있던 창이 로그인 화면 위에 남는다.
  useEffect(() => {
    if (!working || !enabled) setOpen(false);
  }, [working, enabled]);

  // 여기서 바로 찍을 수 있게 한다 — 알림을 보고 다시 출근 확인 화면까지 들어가야 하면
  // 그냥 안 찍고 넘어가게 된다.
  // 더블클릭으로 두 번 찍히지 않게 — isPending 은 리렌더 뒤에야 켜진다
  const runOnce = useSubmitLock();

  const checkOutNow = useMutation({
    mutationFn: requestCheckOut,
    onSuccess: closed => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
      toast.success(`퇴근 기록 완료 — 오늘 ${formatMinutes(closed.workMinutes)} 근무`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '퇴근을 기록하지 못했습니다.')),
  });

  // 기준 시간을 채웠는지 — 제목과 본문 문구가 갈린다.
  // 훅보다 먼저 계산한다(훅은 조기 반환 위에 있어야 한다).
  const over = remaining <= 0;

  useBlinkingTitle(open, over ? '⏰ 퇴근 시간입니다' : '⏰ 퇴근 시간이 다 됐습니다');

  if (!open || !record) return null;

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
          기준 {formatMinutes(standard)}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={checkOutNow.isPending}
            className="btn-secondary flex-1"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => runOnce(() => checkOutNow.mutateAsync().catch(() => {}))}
            disabled={checkOutNow.isPending}
            className="btn-primary inline-flex flex-1 items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {checkOutNow.isPending ? '기록 중...' : '퇴근하기'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
