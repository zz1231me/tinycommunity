// client/src/pages/attendance/AttendancePage.tsx
// 출근 확인 — 직접 출근·퇴근을 찍고, 이번 달 내 기록을 본다.
//
// 하루 한 번씩만 찍힌다. 이미 찍은 뒤에는 버튼이 아니라 찍힌 시각을 보여 준다.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, LogIn, LogOut } from 'lucide-react';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { ListError, ListLoading, ListState } from '../../components/common/ListState';
import { CheckInDialog } from '../../components/attendance/CheckInDialog';
import { attendanceKeys } from '../../api/queryKeys';
import {
  checkIn as requestCheckIn,
  checkOut as requestCheckOut,
  fetchMyAttendance,
  fetchMyAttendanceHistory,
} from '../../api/attendance';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';
import {
  checkInLabel,
  checkOutLabel,
  formatClock,
  formatMinutes,
  shiftMonth,
  todayString,
} from '../../utils/attendance';

/** 화면 위쪽의 시계 — 지금이 몇 시인지 보고 찍는다 */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Badge({ tone, children }: { tone: 'ok' | 'warn'; children: React.ReactNode }) {
  const color =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{children}</span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const now = useNow();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [month, setMonth] = useState(() => todayString().slice(0, 7));

  const status = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: fetchMyAttendance,
  });

  const history = useQuery({
    queryKey: attendanceKeys.history(month),
    queryFn: () => fetchMyAttendanceHistory(month),
  });

  // 출근·퇴근을 찍으면 오늘 상태와 이번 달 기록이 함께 바뀐다
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
  };

  const checkInMutation = useMutation({
    mutationFn: requestCheckIn,
    onSuccess: record => {
      setDialogOpen(false);
      refresh();
      toast.success(
        record.checkInStatus === 'late'
          ? `출근 기록 완료 (${formatClock(record.checkInAt)}, 지각)`
          : `출근 기록 완료 (${formatClock(record.checkInAt)})`
      );
    },
    onError: err => toast.error(getApiErrorMessage(err, '출근을 기록하지 못했습니다.')),
  });

  const checkOutMutation = useMutation({
    mutationFn: requestCheckOut,
    onSuccess: record => {
      refresh();
      toast.success(`퇴근 기록 완료 — 오늘 ${formatMinutes(record.workMinutes)} 근무`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '퇴근을 기록하지 못했습니다.')),
  });

  const record = status.data?.record ?? null;
  const policy = status.data?.policy;
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <PageContainer>
      <PageHeader
        title="출근 확인"
        description="출근과 퇴근을 직접 기록합니다. 기록은 관리자만 함께 볼 수 있습니다."
        icon={<Clock className="h-6 w-6 text-primary-600 dark:text-primary-400" />}
      />

      {status.isLoading ? (
        <ListLoading />
      ) : status.isError ? (
        <ListError what="출퇴근 현황" />
      ) : (
        <section className="card p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {status.data?.workDate}
                {policy && ` · 기준 ${policy.workStartTime} ~ ${policy.workEndTime}`}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {clock}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {record ? (
                  <>
                    <Badge tone={record.checkInStatus === 'late' ? 'warn' : 'ok'}>
                      출근 {formatClock(record.checkInAt)} · {checkInLabel[record.checkInStatus]}
                    </Badge>
                    {record.checkOutAt && (
                      <Badge tone={record.checkOutStatus === 'early' ? 'warn' : 'ok'}>
                        퇴근 {formatClock(record.checkOutAt)} ·{' '}
                        {checkOutLabel[record.checkOutStatus ?? 'normal']}
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    아직 출근을 찍지 않았습니다.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                disabled={Boolean(record)}
                className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LogIn className="h-4 w-4" />
                출근
              </button>
              <button
                type="button"
                onClick={() => checkOutMutation.mutate()}
                disabled={!record || Boolean(record.checkOutAt) || checkOutMutation.isPending}
                className="btn-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <LogOut className="h-4 w-4" />
                퇴근
              </button>
            </div>
          </div>

          {record && record.checklist.length > 0 && (
            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                오늘 출근할 때 확인한 내용
              </p>
              <ul className="space-y-1">
                {record.checklist.map(answer => (
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
              {record.note && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  남긴 말: {record.note}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <section className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 className="card-title">내 기록</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth(m => shiftMonth(m, -1))}
              aria-label="이전 달"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[72px] text-center text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
              {month}
            </span>
            <button
              type="button"
              onClick={() => setMonth(m => shiftMonth(m, 1))}
              aria-label="다음 달"
              disabled={month >= todayString().slice(0, 7)}
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
              <Stat label="근무일" value={`${history.data?.summary.days ?? 0}일`} />
              <Stat label="지각" value={`${history.data?.summary.lateDays ?? 0}일`} />
              <Stat label="조기 퇴근" value={`${history.data?.summary.earlyLeaveDays ?? 0}일`} />
              <Stat label="총 근무" value={formatMinutes(history.data?.summary.totalMinutes)} />
            </div>

            {(history.data?.records.length ?? 0) === 0 ? (
              <ListState size="roomy">이 달에는 기록이 없습니다.</ListState>
            ) : (
              <div className="overflow-x-auto">
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
                      <tr key={row.id}>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                          {row.workDate}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                          {formatClock(row.checkInAt)}
                          {row.checkInStatus === 'late' && (
                            <span className="ml-1.5 text-xs text-amber-600">지각</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                          {row.checkOutAt ? formatClock(row.checkOutAt) : '—'}
                          {row.checkOutStatus === 'early' && (
                            <span className="ml-1.5 text-xs text-amber-600">조기</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                          {row.workMinutes === null ? '—' : formatMinutes(row.workMinutes)}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                          {row.checklist.filter(c => c.checked).length}/{row.checklist.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          onSubmit={payload => checkInMutation.mutate(payload)}
        />
      )}
    </PageContainer>
  );
}
