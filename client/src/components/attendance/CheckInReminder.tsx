// client/src/components/attendance/CheckInReminder.tsx
// 오늘 출근을 아직 안 찍었으면 하루에 한 번 알린다.
//
// 출근은 '찍으러 들어가기가 번거롭다' 가 문제라 이 창에서 바로 찍을 수 있게 한다.
// (짝이던 퇴근 기준시간 알림은 뺐다 — 일하는 중에 화면을 가로막는 쪽이 성가셨다.)
//
// 확인 항목이 필요한 자리면 이 창에서 곧바로 확인 대화상자로 넘어간다 —
// 출근 화면까지 들어갔다 나오게 하면 알림을 띄운 보람이 없다.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { ModalShell } from '../common/ModalShell';
import { CheckInDialog } from './CheckInDialog';
import { attendanceKeys } from '../../api/queryKeys';
import { checkIn as requestCheckIn, fetchMyAttendance } from '../../api/attendance';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { useFeature } from '../../store/features';
import { useSubmitLock } from '../../hooks/useSubmitLock';
import { useAuth } from '../../store/auth';
import { formatClock } from '../../utils/attendance';
import { shouldNoticeCheckIn } from './checkInNoticeRule';

const seenKey = (workDate: string) => `attendanceCheckInNotice:${workDate}`;

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
    // 저장을 못 해도 알림 자체는 동작해야 한다 (그 세션에서 한 번 더 뜰 뿐)
  }
}

export function CheckInReminder() {
  const queryClient = useQueryClient();
  const loggedIn = useAuth(s => s.isAuthenticated);
  const enabled = useFeature('tools.attendance') && loggedIn;

  const [open, setOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const noticedRef = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
    enabled,
    // 출퇴근 화면과 같은 캐시를 쓴다
    staleTime: 5 * 60_000,
  });

  const workDate = data?.workDate ?? '';
  const hasRecordToday = Boolean(data?.record);

  useEffect(() => {
    if (!data || !workDate) return;
    const seen = noticedRef.current === workDate || alreadyNoticed(workDate);
    const should = shouldNoticeCheckIn({
      enabled,
      hasRecordToday,
      alreadyNoticed: seen,
      hour: new Date().getHours(),
    });
    if (!should) return;

    noticedRef.current = workDate;
    markNoticed(workDate);
    setOpen(true);
  }, [data, enabled, hasRecordToday, workDate]);

  // 어딘가에서 출근을 찍으면 이 창도 닫는다.
  // 로그아웃해도 닫는다 — 화면만 바뀌고 이 컴포넌트는 그대로 살아 있어서(App 최상단에
  // 붙어 있다), 열려 있던 창이 로그인 화면 위에 남는다.
  useEffect(() => {
    if (hasRecordToday || !enabled) {
      setOpen(false);
      setChecklistOpen(false);
    }
  }, [hasRecordToday, enabled]);

  const runOnce = useSubmitLock();

  const checkInNow = useMutation({
    mutationFn: requestCheckIn,
    onSuccess: record => {
      setOpen(false);
      setChecklistOpen(false);
      queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
      toast.success(`출근 기록 완료 (${formatClock(record.checkInAt)})`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '출근을 기록하지 못했습니다.')),
  });

  if (!data) return null;

  const items = data.checklist;
  const requireChecklist = data.policy.requireChecklist;
  // 확인할 것이 있으면 대화상자를 거친다. 없으면 이 자리에서 바로 찍는다.
  const needsChecklist = items.length > 0 && (requireChecklist || items.some(i => i.required));

  if (checklistOpen) {
    return (
      <CheckInDialog
        items={items}
        requireChecklist={requireChecklist}
        graceMinutes={data.policy.checkInGraceMinutes}
        submitting={checkInNow.isPending}
        onClose={() => {
          setChecklistOpen(false);
          setOpen(false);
        }}
        onSubmit={payload => runOnce(() => checkInNow.mutateAsync(payload).catch(() => {}))}
      />
    );
  }

  if (!open) return null;

  const grace = data.policy.checkInGraceMinutes;

  return (
    <ModalShell label="출근 안내" onClose={() => setOpen(false)} className="w-full max-w-sm">
      <div className="p-5 text-center">
        <LogIn className="mx-auto h-8 w-8 text-primary-600 dark:text-primary-400" />
        <h2 className="card-title mt-3">오늘 출근 기록이 없습니다</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          지금 바로 출근을 기록할 수 있습니다.
        </p>
        {grace > 0 && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            출근 시각은 {grace}분 앞당겨 기록됩니다.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={checkInNow.isPending}
            className="btn-secondary flex-1"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={() => {
              if (needsChecklist) {
                setChecklistOpen(true);
                return;
              }
              void runOnce(() => checkInNow.mutateAsync({ responses: [] }).catch(() => {}));
            }}
            disabled={checkInNow.isPending}
            className="btn-primary inline-flex flex-1 items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {checkInNow.isPending ? '기록 중...' : needsChecklist ? '확인하고 출근' : '출근하기'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
