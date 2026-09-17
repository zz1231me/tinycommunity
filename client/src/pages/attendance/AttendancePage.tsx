// client/src/pages/attendance/AttendancePage.tsx
// 출근 확인 — 직접 출근·퇴근을 찍고, 달마다 내 기록을 본다.
//
// 하루 한 번씩만 찍힌다. 이미 찍은 뒤에는 버튼 대신 찍힌 시각과 흐른 시간을 보여 준다.

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
  fetchAttackState,
  fetchMyAttendance,
  fetchMyAttendanceHistory,
  markPopupSeen,
  sendAttack,
  sendDefend,
} from '../../api/attendance';
import {
  AttackBanner,
  AttackLauncher,
  PopupAlert,
} from '../../components/attendance/AttendanceAttack';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import { useSubmitLock } from '../../hooks/useSubmitLock';
import { useFeature } from '../../store/features';
import { useAuth } from '../../store/auth';
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
  // 달은 서버가 알려 준 근무일을 기준으로 잡는다. 브라우저 시계가 하루 어긋나 있으면
  // 처음 열었을 때 엉뚱하게 빈 달이 보인다.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);

  const status = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
  });

  const month = pickedMonth ?? status.data?.workDate.slice(0, 7) ?? todayString().slice(0, 7);
  const serverToday = status.data?.workDate ?? todayString();

  // status 를 기다리지 않는다. 기다리게 하면 오늘 상태 조회가 실패했을 때
  // 아래 '내 기록' 이 영영 로딩으로 남는다.
  const history = useQuery({
    queryKey: attendanceKeys.history(month),
    queryFn: () => fetchMyAttendanceHistory(month),
    // 달을 넘길 때 표·그래프가 사라졌다 다시 그려지면 화면이 튄다
    placeholderData: prev => prev,
  });

  // 출근·퇴근을 찍으면 오늘 상태와 이번 달 기록이 함께 바뀐다
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

  // 더블클릭으로 두 번 찍히지 않게 — 서버가 409 로 막긴 하지만 성공 뒤에 오류가 따라붙는다
  const runOnce = useSubmitLock();

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

  // ── 퇴근 공격 ──
  // 잠기는 것은 아래 퇴근 버튼뿐이다. 서버의 퇴근 기록은 이 상태를 보지 않으므로,
  // 어떤 경로로든 퇴근을 찍으면 그 순간이 그대로 기록된다.
  const attackEnabled = useFeature('tools.attendanceAttack');
  const { getUser } = useAuth();
  const myId = getUser()?.id ?? '';

  const attack = useQuery({
    queryKey: attendanceKeys.attack,
    queryFn: fetchAttackState,
    enabled: attackEnabled,
    // 걸린 공격은 1분이면 저절로 풀리니 짧은 주기로 물어봐야 한다. 다만 근무 중일
    // 때만 묻는다 — 출근 전이거나 이미 퇴근했으면 방해받을 버튼 자체가 없다.
    refetchInterval: () => {
      const live = status.data?.record ?? status.data?.openPrevious ?? null;
      return live && !live.checkOutAt ? 20_000 : false;
    },
  });

  const refreshAttack = () => queryClient.invalidateQueries({ queryKey: attendanceKeys.attack });

  const defendMutation = useMutation({
    mutationFn: sendDefend,
    onSuccess: () => {
      refreshAttack();
      toast.success('방어했습니다. 퇴근 버튼이 풀렸습니다.');
    },
    onError: err => toast.error(getApiErrorMessage(err, '방어하지 못했습니다.')),
  });

  const attackMutation = useMutation({
    mutationFn: sendAttack,
    onSuccess: () => {
      refreshAttack();
      toast.success('공격권을 사용했습니다.');
    },
    onError: err => toast.error(getApiErrorMessage(err, '공격권을 사용하지 못했습니다.')),
  });

  const popupSeen = useMutation({
    mutationFn: markPopupSeen,
    // 실패해도 창은 닫는다. 못 닫는 쪽지가 화면에 남는 것이 더 나쁘다.
    onSettled: () => refreshAttack(),
  });

  const incoming = attack.data?.incoming ?? null;
  const popup = attack.data?.popup ?? null;
  // 서버가 준 만료 시각으로 직접 판단한다 — 이미 지난 공격을 아직 받아 오지 않았을 수 있다
  const underAttack = Boolean(incoming && new Date(incoming.expiresAt).getTime() > Date.now());

  const record = status.data?.record ?? null;
  const openPrevious = status.data?.openPrevious ?? null;
  // 자정을 넘겨 이어지는 기록이 있으면 그것이 지금 살아 있는 기록이다.
  // 그러지 않으면 밤을 새운 사람 화면에만 '출근 전' 이라고 뜬다(관리자 화면은 근무 중).
  const live = record ?? openPrevious;
  const liveWorkDate = openPrevious?.workDate ?? serverToday;
  const standard = status.data?.policy.standardWorkMinutes ?? 480;
  const summary = history.data?.summary;
  // 오늘은 아직 근무 중이라 퇴근이 없는 것이 정상이다 — 빠뜨린 날에서 뺀다
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

          {attackEnabled && incoming && underAttack && attack.data && (
            <AttackBanner
              incoming={incoming}
              defendCost={attack.data.rules.defendCost}
              balance={attack.data.balance}
              defending={defendMutation.isPending}
              onDefend={() => defendMutation.mutate(incoming.id)}
              onExpire={refreshAttack}
            />
          )}

          <TodayHero
            workDate={serverToday}
            record={live}
            standardWorkMinutes={standard}
            // 어제 퇴근을 안 찍었어도 오늘 출근은 따로 찍는다. 막으면 어제 것을
            // 먼저 마감해야 하고, 그 시각이 오늘이라 없던 밤샘 근무가 생긴다.
            canCheckIn={!record}
            // 공격받는 중에도 퇴근은 누를 수 있다. 버튼이 도망다닐 뿐이다 —
            // 막아 버리면 남이 내 퇴근 기록 시각을 늦출 수 있게 된다.
            canCheckOut={Boolean(live && !live.checkOutAt)}
            chaos={attackEnabled && underAttack}
            checkingOut={checkOutMutation.isPending}
            onCheckIn={() => setDialogOpen(true)}
            onCheckOut={() => runOnce(() => checkOutMutation.mutateAsync().catch(() => {}))}
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

      {attackEnabled && attack.data && (
        <AttackLauncher
          state={attack.data}
          myId={myId}
          sending={attackMutation.isPending}
          onAttack={payload => attackMutation.mutate(payload)}
        />
      )}

      {attackEnabled && popup && (
        <PopupAlert popup={popup} onClose={() => popupSeen.mutate(popup.id)} />
      )}

      <section
        className="card mt-4 overflow-hidden"
        aria-live="polite"
        aria-busy={history.isFetching}
      >
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

            {(history.data?.records.length ?? 0) === 0 ? (
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
                      {history.data?.records.map(row => (
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
                              // 이어지지도 않는 지난 날의 열린 기록은 그냥 안 찍은 것이다
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
          submitting={checkInMutation.isPending}
          onClose={() => setDialogOpen(false)}
          onSubmit={payload => runOnce(() => checkInMutation.mutateAsync(payload).catch(() => {}))}
        />
      )}
    </PageContainer>
  );
}
