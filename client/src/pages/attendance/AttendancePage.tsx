// 출근·퇴근을 직접 찍고 달마다 내 기록을 보는 화면.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { ListError, ListLoading, ListState } from '../../components/common/ListState';
import { CheckInDialog } from '../../components/attendance/CheckInDialog';
import { TodayHero } from '../../components/attendance/TodayHero';
import { MonthChart } from '../../components/attendance/MonthChart';
import { attendanceKeys } from '../../api/queryKeys';
import {
  checkIn as requestCheckIn,
  checkOut as requestCheckOut,
  undoCheckOut as requestUndoCheckOut,
  fetchAttackState,
  fetchMyAttendance,
  fetchMyAttendanceHistory,
} from '../../api/attendance';
import { IncomingAttack } from '../../components/attendance/IncomingAttack';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { useSubmitLock } from '../../hooks/useSubmitLock';
import { useFeature } from '../../store/features';
import { useNotificationArrival } from '../../hooks/useNotificationArrival';
import {
  formatClock,
  formatDay,
  formatMinutes,
  formatMonth,
  shiftMonth,
  todayString,
  weekdayOf,
  weekdayTone,
} from '../../utils/attendance';
import { useAttackQueue } from '../../hooks/useAttackQueue';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {hint && <p className="mt-0.5 text-2xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  // 달은 서버가 알려 준 근무일을 기준으로 잡는다. 브라우저 시계가 어긋나면 빈 달이 보인다.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);

  const status = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
  });

  const month = pickedMonth ?? status.data?.workDate.slice(0, 7) ?? todayString().slice(0, 7);
  const serverToday = status.data?.workDate ?? todayString();

  // status 를 기다리지 않는다. 기다리면 오늘 상태 조회 실패 시 기록이 계속 로딩으로 남는다.
  const history = useQuery({
    queryKey: attendanceKeys.history(month),
    queryFn: () => fetchMyAttendanceHistory(month),
    // 달을 넘길 때 표와 그래프가 사라졌다 다시 그려지지 않게 한다.
    placeholderData: prev => prev,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: attendanceKeys.all });

  const checkInMutation = useMutation({
    mutationFn: requestCheckIn,
    onSuccess: record => {
      setDialogOpen(false);
      refresh();
      toast.success(`출근 기록 완료 (${formatClock(record.checkInAt)})`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '출근을 기록하지 못했습니다.')),
  });

  // 더블클릭으로 두 번 찍히지 않게 막는다. 출근과 퇴근은 서로 막지 않도록 잠금을 따로 쓴다.
  const runCheckIn = useSubmitLock();
  const runCheckOut = useSubmitLock();

  const checkOutMutation = useMutation({
    mutationFn: requestCheckOut,
    onSuccess: closed => {
      refresh();
      toast.success(
        `퇴근 기록 완료 — ${formatDay(closed.workDate)} ${formatMinutes(closed.workMinutes)} 근무`
      );
    },
    onError: err => toast.error(getApiErrorMessage(err, '퇴근을 기록하지 못했습니다.')),
  });

  // 잘못 누른 퇴근을 10분 안에 되돌린다.
  const runUndo = useSubmitLock();
  const undoMutation = useMutation({
    mutationFn: requestUndoCheckOut,
    onSuccess: () => {
      refresh();
      toast.success('퇴근을 취소했습니다. 다시 근무 중입니다.');
    },
    onError: err => {
      // 마감이 지났거나 상태가 바뀐 경우라 다시 읽는다.
      refresh();
      toast.error(getApiErrorMessage(err, '퇴근을 취소하지 못했습니다.'));
    },
  });

  // 퇴근 공격은 퇴근 버튼만 잠근다. 서버 기록은 이 상태를 보지 않는다.
  const attackEnabled = useFeature('tools.attendanceAttack');

  const attack = useQuery({
    queryKey: attendanceKeys.attack,
    queryFn: fetchAttackState,
    enabled: attackEnabled,
    // 공격은 1분이면 풀리므로 근무 중일 때만 짧은 주기로 확인한다. 알림이 끊겼을 때의 대비다.
    refetchInterval: () => {
      const live = status.data?.record ?? status.data?.openPrevious ?? null;
      return live && !live.checkOutAt ? 10_000 : false;
    },
    // 다른 탭에 있다 돌아왔을 때 그 사이 걸린 공격이 보이도록 여기서만 켠다.
    refetchOnWindowFocus: true,
  });

  const refreshAttack = () => queryClient.invalidateQueries({ queryKey: attendanceKeys.attack });

  // 공격 알림이 오면 바로 다시 읽는다.
  useNotificationArrival(['ATTACK'], () => {
    void refreshAttack();
  });

  // 내 시계와 서버 시계의 차이. 어긋나면 걸린 공격이 이미 끝난 것으로 보인다.
  const clockOffset =
    attack.data?.now && attack.dataUpdatedAt
      ? new Date(attack.data.now).getTime() - attack.dataUpdatedAt
      : 0;
  // 지금 걸린 공격은 큐에서 직접 고른다. incoming 만 보면 공격 사이에 버튼이 잠깐 풀린다.
  const { active: incoming, waiting } = useAttackQueue(attack.data, clockOffset);
  const underAttack = Boolean(incoming);

  const record = status.data?.record ?? null;
  const openPrevious = status.data?.openPrevious ?? null;
  // 자정을 넘겨 이어지는 기록이 있으면 그것이 현재 기록이다.
  const live = record ?? openPrevious;
  const liveWorkDate = openPrevious?.workDate ?? serverToday;
  const standard = status.data?.policy.standardWorkMinutes ?? 480;
  const summary = history.data?.summary;
  // 오늘은 퇴근이 없는 것이 정상이라 빠뜨린 날에서 뺀다.
  const todayOpen = Boolean(live && !live.checkOutAt && month === live.workDate.slice(0, 7));
  const unclosedDays = Math.max(0, (summary?.openDays ?? 0) - (todayOpen ? 1 : 0));

  return (
    <PageContainer>
      <PageHeader
        title="출근 확인"
        description={status.data?.policy.noticeText ?? ''}
        icon={<Clock className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      />

      {status.isLoading ? (
        <ListLoading />
      ) : status.isError ? (
        <ListError what="출퇴근 현황" />
      ) : (
        <>
          {openPrevious && (
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <p className="min-w-0 text-amber-800 dark:text-amber-300">
                <span className="tabular-nums">{formatDay(openPrevious.workDate)}</span> 출근이 퇴근
                없이 남아 있습니다. 퇴근을 누르면 지금 시각으로 마감됩니다.
              </p>
            </div>
          )}

          {/* 경고 띠·남은 시간·방어권 구매를 이 자리에서 처리한다. 공격권 구매는 포인트 탭에만 있다. */}
          {attackEnabled && live && !live.checkOutAt && <IncomingAttack />}

          <TodayHero
            workDate={serverToday}
            record={live}
            standardWorkMinutes={standard}
            // 어제 퇴근을 안 찍었어도 오늘 출근은 따로 찍는다.
            canCheckIn={!record}
            // 공격 중에도 퇴근은 누를 수 있다. 막으면 남이 내 퇴근 시각을 늦출 수 있다.
            canCheckOut={Boolean(live && !live.checkOutAt)}
            attackKind={attackEnabled && underAttack && incoming ? incoming.kind : null}
            attackExpiresAt={attackEnabled && underAttack && incoming ? incoming.expiresAt : null}
            attackLevel={attackEnabled && underAttack ? Math.max(1, waiting + 1) : 0}
            checkingOut={checkOutMutation.isPending}
            onCheckIn={() => setDialogOpen(true)}
            onCheckOut={() => runCheckOut(() => checkOutMutation.mutateAsync().catch(() => {}))}
            undoCheckOutUntil={status.data?.undoCheckOutUntil ?? null}
            clockOffset={clockOffset}
            undoingCheckOut={undoMutation.isPending}
            onUndoCheckOut={() => runUndo(() => undoMutation.mutateAsync().catch(() => {}))}
          />

          {live && live.checklist.length > 0 && (
            <section className="card mt-4 p-5">
              <h2 className="card-title mb-3">출근할 때 확인한 내용</h2>
              <ul className="space-y-1.5">
                {live.checklist.map(answer => (
                  <li
                    key={answer.itemId}
                    className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                  >
                    <span
                      aria-hidden="true"
                      className={answer.checked ? 'text-emerald-600' : 'text-slate-300'}
                    >
                      {answer.checked ? '☑' : '☐'}
                    </span>
                    <span className="min-w-0">{answer.label}</span>
                  </li>
                ))}
              </ul>
              {live.note && (
                <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  남긴 말: {live.note}
                </p>
              )}
            </section>
          )}
        </>
      )}

      <section className="card mt-4 overflow-hidden" aria-busy={history.isFetching}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="card-title">내 기록</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPickedMonth(shiftMonth(month, -1))}
              aria-label="이전 달"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[90px] text-center text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
              {formatMonth(month)}
            </span>
            <button
              type="button"
              onClick={() => setPickedMonth(shiftMonth(month, 1))}
              aria-label="다음 달"
              disabled={month >= serverToday.slice(0, 7)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {history.isLoading ? (
          <ListLoading />
        ) : history.isError ? (
          <ListError what="출퇴근 기록" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
              <Stat label="근무일" value={`${summary?.days ?? 0}일`} />
              <Stat label="총 근무" value={formatMinutes(summary?.totalMinutes)} />
              <Stat
                label="하루 평균"
                value={formatMinutes(summary?.averageMinutes)}
                hint={`기준 ${formatMinutes(standard)}`}
              />
              <Stat
                label="퇴근 안 찍은 날"
                value={`${unclosedDays}일`}
                hint={unclosedDays > 0 ? '근무 시간 미집계' : undefined}
              />
            </div>

            {(history.data?.records?.length ?? 0) === 0 ? (
              <ListState size="roomy">이 달에는 기록이 없습니다.</ListState>
            ) : (
              <>
                <MonthChart
                  month={month}
                  records={history.data?.records ?? []}
                  standardWorkMinutes={standard}
                  liveWorkDate={liveWorkDate}
                />

                <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">날짜</th>
                        <th className="px-4 py-2 text-left font-medium">출근</th>
                        <th className="px-4 py-2 text-left font-medium">퇴근</th>
                        <th className="px-4 py-2 text-left font-medium">근무</th>
                        <th className="px-4 py-2 text-left font-medium">확인</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(history.data?.records ?? []).map(row => (
                        <tr
                          key={row.id}
                          className={
                            row.workDate === serverToday
                              ? 'bg-primary-50/40 dark:bg-primary-500/5'
                              : ''
                          }
                        >
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                            {formatDay(row.workDate)}
                            <span className={`ml-1.5 text-xs ${weekdayTone(row.workDate)}`}>
                              ({weekdayOf(row.workDate)})
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                            {formatClock(row.checkInAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                            {row.checkOutAt ? (
                              formatClock(row.checkOutAt)
                            ) : row.workDate === liveWorkDate ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                근무 중
                              </span>
                            ) : (
                              // 이어지지 않는 지난 날의 열린 기록은 안 찍은 것으로 본다.
                              <span className="text-amber-600 dark:text-amber-400">
                                퇴근 안 찍음
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                            {row.workMinutes === null ? '—' : formatMinutes(row.workMinutes)}
                          </td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                            {row.checklist.length === 0
                              ? '—'
                              : `${row.checklist.filter(c => c.checked).length}/${row.checklist.length}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {dialogOpen && status.data && (
        <CheckInDialog
          items={status.data.checklist}
          requireChecklist={status.data.policy.requireChecklist}
          graceMinutes={status.data.policy.checkInGraceMinutes}
          submitting={checkInMutation.isPending}
          onClose={() => setDialogOpen(false)}
          onSubmit={payload =>
            runCheckIn(() => checkInMutation.mutateAsync(payload).catch(() => {}))
          }
        />
      )}
    </PageContainer>
  );
}
