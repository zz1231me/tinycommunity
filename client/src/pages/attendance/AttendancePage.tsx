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
import { useNotificationStore } from '../../store/notifications';
import { ConfirmationModal } from '../../components/admin/common/ConfirmationModal';
import {
  formatClock,
  formatDay,
  formatMinutes,
  minutesBetween,
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
  // 기준 시간을 못 채우고 퇴근을 누르면 한 번 더 묻는다. 그때까지 일한 분을 담아 둔다.
  const [askingWorked, setAskingWorked] = useState<number | null>(null);
  // 달은 서버가 알려 준 근무일을 기준으로 잡는다. 브라우저 시계가 어긋나면 빈 달이 보인다.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);

  const status = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
    // 출근·퇴근은 다른 기기(휴대폰)나 다른 탭에서도 찍는다. 그런데 이 조회에는 주기도
    // 알림도 없어서, 그렇게 찍고 이 화면으로 돌아오면 '출근 전' 인 채로 남아 있었다.
    // 그러면 공격이 와도 근무 중이 아닌 줄 알고 아무 표시도 하지 않는다(실제로 그렇게 됐다).
    // 탭으로 돌아올 때 다시 읽는다. 주기 조회는 두지 않는다 — 돌아올 때면 충분하다.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
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

  // 알림이 살아 있으면 주기적인 확인을 늦춘다. 공격은 알림이 먼저 알려 준다.
  const notificationsLive = useNotificationStore(s => s.isLive);

  const attack = useQuery({
    queryKey: attendanceKeys.attack,
    queryFn: fetchAttackState,
    enabled: attackEnabled,
    // 공격은 1분이면 풀리므로 근무 중일 때만 주기적으로 확인한다. 알림이 끊겼을 때의 대비다.
    // SSE 가 살아 있으면 공격이 오는 순간 아래 useNotificationArrival 이 다시 읽으므로,
    // 주기는 어긋남을 바로잡는 정도로 늦춘다 — 10초마다 묻는 것은 사람 수만큼 쌓인다.
    refetchInterval: () => {
      const open = status.data?.record ?? status.data?.openPrevious ?? null;
      if (!open || open.checkOutAt) return false;
      return notificationsLive ? 60_000 : 10_000;
    },
    // 다른 탭에 있다 돌아왔을 때 그 사이 걸린 공격이 보이도록 여기서만 켠다.
    refetchOnWindowFocus: true,
  });

  const refreshAttack = () => queryClient.invalidateQueries({ queryKey: attendanceKeys.attack });

  // 공격 알림이 오면 바로 다시 읽는다. 오늘 상태도 같이 읽는다 — 다른 기기에서 출근을
  // 찍었다면 이 화면은 아직 '출근 전' 이라, 공격 상태만 받아도 그릴 자리가 없다.
  useNotificationArrival(['ATTACK'], () => {
    void refreshAttack();
    void queryClient.invalidateQueries({ queryKey: attendanceKeys.me });
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
  const doCheckOut = () => runCheckOut(() => checkOutMutation.mutateAsync().catch(() => {}));

  // 기준 시간을 못 채웠으면 바로 찍지 않고 한 번 묻는다. 누른 순간으로 다시 센다.
  const askThenCheckOut = () => {
    const worked = live ? minutesBetween(live.checkInAt, new Date()) : 0;
    if (worked >= standard) return doCheckOut();
    setAskingWorked(worked);
  };

  // 오늘은 퇴근이 없는 것이 정상이라 빠뜨린 날에서 뺀다.
  const todayOpen = Boolean(live && !live.checkOutAt && month === live.workDate.slice(0, 7));
  const unclosedDays = Math.max(0, (summary?.openDays ?? 0) - (todayOpen ? 1 : 0));

  return (
    <PageContainer>
      {/* 사이드바·메뉴 숨기기와 같은 이름을 쓴다(constants/menus.ts 의 규칙).
          '출근 확인' 이라고 적혀 있어, 사이드바의 '출퇴근' 을 누른 사람이 다른 곳에 온
          것처럼 읽혔다. 이 화면은 출근만이 아니라 퇴근과 지난 기록까지 다룬다. */}
      <PageHeader
        title="출퇴근"
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
            onCheckOut={askThenCheckOut}
            undoCheckOutUntil={status.data?.undoCheckOutUntil ?? null}
            undoMinutes={status.data?.policy.undoMinutes ?? 10}
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

      <ConfirmationModal
        open={askingWorked !== null}
        title="아직 기준 시간 전입니다"
        message={`기준 ${formatMinutes(standard)} 중 ${formatMinutes(askingWorked ?? 0)} 근무했습니다. ${formatMinutes(standard - (askingWorked ?? 0))} 모자랍니다. 지금 퇴근할까요?`}
        confirmLabel="퇴근"
        cancelLabel="더 근무"
        variant="primary"
        onConfirm={() => {
          setAskingWorked(null);
          doCheckOut();
        }}
        onCancel={() => setAskingWorked(null)}
      />

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
