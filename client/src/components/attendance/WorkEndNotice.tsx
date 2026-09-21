// client/src/components/attendance/WorkEndNotice.tsx
// 기준 근무 시간 10분 전에 한 번, 지나고 3분 뒤에 한 번 더 알린다.
//
// 예전에는 화면을 가로막는 안내창이었다. 일하는 중에 창이 뜨면 성가셔서 뺐다가,
// 알림 자체는 필요하다고 해서 맨 위를 가로지르는 띠로 되살렸다 — 눈에는 걸리지만
// 하던 일을 막지는 않는다. 띠에서 바로 퇴근을 찍을 수 있다(다시 들어가야 하면
// 그냥 안 찍고 넘어가게 된다).
//
// 서버를 반복해서 찌르지 않는다. 출근 시각과 기준 시간을 알면 언제 알릴지 계산할 수
// 있으므로, 남은 시간만 주기적으로 세어 본다.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceKeys } from '../../api/queryKeys';
import { checkOut as requestCheckOut, fetchMyAttendance } from '../../api/attendance';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { useFeature } from '../../store/features';
import { useSubmitLock } from '../../hooks/useSubmitLock';
import { useAuth } from '../../store/auth';
import { formatMinutes, minutesBetween } from '../../utils/attendance';
import { TopNotice, TopNoticeSlot } from '../common/TopNotice';
import { reminderRecord, notifyStage, type NoticeStage } from './reminderRule';

/** 남은 시간을 다시 세어 보는 간격 */
const CHECK_MS = 30_000;

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

export function WorkEndNotice() {
  const queryClient = useQueryClient();
  const loggedIn = useAuth(s => s.isAuthenticated);
  // 로그인 화면에서까지 물어볼 이유가 없다
  const enabled = useFeature('tools.attendance') && loggedIn;
  const [stageShown, setStageShown] = useState<NoticeStage | null>(null);
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
      noticedLate: seen('late'),
    });
    if (!stage) return;

    noticedRef.current.add(`${record.workDate}:${stage}`);
    markNoticed(record.workDate, stage);
    setStageShown(stage);
    // tick 은 다시 계산하게 만드는 값일 뿐이라 의존성에 둔다
  }, [enabled, working, record, standard, worked, tick]);

  // 퇴근을 찍으면 알림도 거둔다.
  // 로그아웃해도 거둔다 — 화면만 바뀌고 이 컴포넌트는 그대로 살아 있어서,
  // 띠가 로그인 화면 위에 남는다.
  useEffect(() => {
    if (!working || !enabled) setStageShown(null);
  }, [working, enabled]);

  // 더블클릭으로 두 번 찍히지 않게 — isPending 은 리렌더 뒤에야 켜진다
  const runOnce = useSubmitLock();

  const checkOutNow = useMutation({
    mutationFn: requestCheckOut,
    onSuccess: closed => {
      setStageShown(null);
      queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
      toast.success(`퇴근 기록 완료 — 오늘 ${formatMinutes(closed.workMinutes)} 근무`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '퇴근을 기록하지 못했습니다.')),
  });

  if (!stageShown) return null;

  const late = stageShown === 'late';
  return (
    <TopNoticeSlot>
      <TopNotice
        icon="⏰"
        title={late ? '퇴근 시간이 지났습니다' : '퇴근 시간 10분 전입니다'}
        message={
          late
            ? `기준 근무 시간을 ${formatMinutes(worked - standard)} 넘겼습니다.`
            : `오늘 ${formatMinutes(worked)} 일했습니다.`
        }
        action={checkOutNow.isPending ? '기록 중…' : '지금 퇴근하기'}
        onAction={() => runOnce(() => checkOutNow.mutateAsync().catch(() => {}))}
        onClose={() => setStageShown(null)}
        tone="amber"
      />
    </TopNoticeSlot>
  );
}
