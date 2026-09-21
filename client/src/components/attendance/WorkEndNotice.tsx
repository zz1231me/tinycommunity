// 기준 근무 시간 10분 전과 3분 초과 시점에 상단 띠로 알린다. 서버를 다시 부르지 않고 남은 시간만 계산한다.

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
/** 단계를 나누기 전에 쓰던 표시 */
const legacyKey = (workDate: string) => `attendanceNotice:${workDate}`;

function alreadyNoticed(workDate: string, stage: NoticeStage): boolean {
  try {
    if (localStorage.getItem(seenKey(workDate, stage)) === '1') return true;
    // 옛 표시는 '10분 전을 봤다' 로 읽어 같은 알림이 다시 뜨지 않게 한다.
    return stage === 'before' && localStorage.getItem(legacyKey(workDate)) === '1';
  } catch {
    return false;
  }
}

function markNoticed(workDate: string, stage: NoticeStage): void {
  try {
    localStorage.setItem(seenKey(workDate, stage), '1');
  } catch {
    // localStorage 를 못 써도 알림은 동작해야 한다.
  }
}

export function WorkEndNotice() {
  const queryClient = useQueryClient();
  const loggedIn = useAuth(s => s.isAuthenticated);
  const enabled = useFeature('tools.attendance') && loggedIn;
  const [stageShown, setStageShown] = useState<NoticeStage | null>(null);
  const [tick, setTick] = useState(0);
  // localStorage 를 못 쓰는 경우를 위해 본 단계를 메모리에도 남긴다.
  const noticedRef = useRef<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
    enabled,
    staleTime: 5 * 60_000,
  });

  // 남은 시간을 주기적으로 다시 계산한다.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setTick(t => t + 1), CHECK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

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
    // tick 은 재계산 트리거라서 의존성에 둔다.
  }, [enabled, working, record, standard, worked, tick]);

  // 퇴근하거나 로그아웃하면 띠를 거둔다. 이 컴포넌트는 로그아웃 후에도 살아 있다.
  useEffect(() => {
    if (!working || !enabled) setStageShown(null);
  }, [working, enabled]);

  // isPending 은 리렌더 뒤에야 켜져 더블클릭을 막지 못한다.
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
    <TopNoticeSlot priority={30}>
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
