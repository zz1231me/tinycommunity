// client/src/components/admin/tabs/AttendanceManagement.tsx
// 출퇴근 — 오늘 현황, 기간별 기록, 인원별 집계, 확인 항목·설정.
//
// 기록에 남은 확인 내용은 그날 찍힌 문구 그대로다. 항목을 나중에 고쳐도
// 지난 기록의 문구는 바뀌지 않는다.

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { ListState } from '../../common/ListState';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import { Pagination } from '../../boards/Pagination';
import { TodayBoardView } from '../attendance/TodayBoardView';
import { ChecklistEditor } from '../attendance/ChecklistEditor';
import { adminKeys } from '../../../api/queryKeys';
import { fetchAdminUsers } from '../../../api/admin';
import {
  createChecklistItem,
  deleteChecklistItem,
  fetchAttendanceRecords,
  fetchAttendanceSettings,
  fetchAttendanceSummary,
  fetchAttendanceToday,
  reorderChecklist,
  updateAttendancePolicy,
  updateChecklistItem,
} from '../../../api/attendance';
import { getApiErrorMessage } from '../../../api/utils';
import { toast } from '../../../utils/toast';
import {
  formatClock,
  formatMinutes,
  todayString,
  weekdayOf,
  weekdayTone,
} from '../../../utils/attendance';
import type { ChecklistItem } from '../../../types/attendance.types';

type View = 'today' | 'records' | 'summary' | 'settings';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'today', label: '오늘' },
  { id: 'records', label: '기록' },
  { id: 'summary', label: '인원별' },
  { id: 'settings', label: '확인 항목·설정' },
];

const PAGE_SIZE = 30;

type SummarySort = 'worked' | 'name';

// 서버(attendance.service)의 검증 범위와 같아야 한다
const STANDARD_MIN = 30;
const STANDARD_MAX = 1440;

/** 오늘 현황은 근무 중인 사람의 시간이 흐르므로 짧게 다시 읽는다 */
const TODAY_REFRESH_MS = 60_000;

function monthStart(): string {
  return `${todayString().slice(0, 7)}-01`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const AttendanceManagement = () => {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('today');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayString);
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ChecklistItem | null>(null);
  const [summarySort, setSummarySort] = useState<SummarySort>('worked');

  const range = useMemo(() => ({ from, to }), [from, to]);

  const { data: users = [] } = useQuery({
    queryKey: adminKeys.users.all,
    queryFn: fetchAdminUsers,
    enabled: view === 'records',
  });

  const board = useQuery({
    queryKey: adminKeys.attendance.today,
    queryFn: fetchAttendanceToday,
    enabled: view === 'today',
    refetchInterval: TODAY_REFRESH_MS,
  });

  const records = useQuery({
    queryKey: adminKeys.attendance.records({ ...range, userId, page }),
    queryFn: () => fetchAttendanceRecords({ ...range, userId: userId || undefined, page }),
    enabled: view === 'records',
  });

  const summary = useQuery({
    queryKey: adminKeys.attendance.summary(range),
    queryFn: () => fetchAttendanceSummary(range),
    enabled: view === 'summary',
  });

  const settings = useQuery({
    queryKey: adminKeys.attendance.settings,
    queryFn: fetchAttendanceSettings,
    enabled: view === 'settings',
  });

  const invalidateSettings = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.attendance.settings });

  const onMutationError = (fallback: string) => (err: unknown) =>
    toast.error(getApiErrorMessage(err, fallback));

  const addItem = useMutation({
    mutationFn: createChecklistItem,
    onSuccess: () => {
      invalidateSettings();
      toast.success('확인 항목이 추가되었습니다.');
    },
    onError: onMutationError('항목을 추가하지 못했습니다.'),
  });

  const patchItem = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ChecklistItem> }) =>
      updateChecklistItem(id, data),
    // 실패해도 서버 값으로 되돌려야 화면과 저장된 값이 갈라지지 않는다
    onSettled: () => invalidateSettings(),
    onError: onMutationError('항목을 수정하지 못했습니다.'),
  });

  const reorder = useMutation({
    mutationFn: reorderChecklist,
    onSettled: () => invalidateSettings(),
    onError: onMutationError('순서를 바꾸지 못했습니다.'),
  });

  const removeItem = useMutation({
    mutationFn: deleteChecklistItem,
    onSuccess: () => toast.success('확인 항목이 삭제되었습니다.'),
    onError: onMutationError('항목을 삭제하지 못했습니다.'),
    onSettled: () => {
      setConfirmDelete(null);
      invalidateSettings();
    },
  });

  const savePolicy = useMutation({
    mutationFn: updateAttendancePolicy,
    onSuccess: () => {
      invalidateSettings();
      toast.success('설정이 저장되었습니다.');
    },
    onError: onMutationError('설정을 저장하지 못했습니다.'),
  });

  const policy = settings.data?.policy;
  // 총 근무가 가장 긴 사람을 눈금으로 삼아 막대를 그린다
  const summaryPeak = Math.max(1, ...(summary.data ?? []).map(r => r.totalMinutes));

  // 기본은 많이 일한 순. 이름순으로 두면 한 명도 안 찍은 사람들 사이에
  // 실제로 근무한 사람이 묻힌다.
  const summaryRows = useMemo(() => {
    const rows = [...(summary.data ?? [])];
    if (summarySort === 'name') return rows.sort((a, b) => a.userName.localeCompare(b.userName));
    return rows.sort(
      (a, b) =>
        b.days - a.days || b.totalMinutes - a.totalMinutes || a.userName.localeCompare(b.userName)
    );
  }, [summary.data, summarySort]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              view === v.id
                ? 'bg-primary-600 font-medium text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'today' && (
        <AdminSection title={`오늘 현황 (${board.data?.workDate ?? todayString()})`}>
          {board.isLoading ? (
            <LoadingSpinner message="오늘 현황 불러오는 중..." />
          ) : board.isError ? (
            <ListState>현황을 불러오지 못했습니다.</ListState>
          ) : board.data ? (
            <TodayBoardView board={board.data} />
          ) : null}
        </AdminSection>
      )}

      {(view === 'records' || view === 'summary') && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="시작일">
            <input
              type="date"
              value={from}
              max={to}
              onChange={e => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="input input-sm w-full"
            />
          </Field>
          <Field label="종료일">
            <input
              type="date"
              value={to}
              min={from}
              onChange={e => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="input input-sm w-full"
            />
          </Field>
          {view === 'records' && (
            <Field label="사용자">
              <select
                value={userId}
                onChange={e => {
                  setUserId(e.target.value);
                  setPage(1);
                }}
                className="input input-sm w-full"
              >
                <option value="">전체</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.id})
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}

      {view === 'records' && (
        <AdminSection title="출퇴근 기록">
          {records.isLoading ? (
            <LoadingSpinner message="기록 불러오는 중..." />
          ) : records.isError ? (
            <ListState>기록을 불러오지 못했습니다.</ListState>
          ) : (records.data?.records.length ?? 0) === 0 ? (
            <ListState size="roomy">이 기간에는 기록이 없습니다.</ListState>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">날짜</th>
                      <th className="px-3 py-2 text-left font-medium">이름</th>
                      <th className="px-3 py-2 text-left font-medium">출근</th>
                      <th className="px-3 py-2 text-left font-medium">퇴근</th>
                      <th className="px-3 py-2 text-left font-medium">근무</th>
                      <th className="px-3 py-2 text-left font-medium">확인</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {records.data?.records.map(row => {
                      const open = expanded === row.id;
                      const missed = row.checklist.filter(c => !c.checked).length;
                      return (
                        <Fragment key={row.id}>
                          <tr className={open ? 'bg-slate-50 dark:bg-slate-800/40' : undefined}>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                              {row.workDate}
                              <span className={`ml-1.5 text-xs ${weekdayTone(row.workDate)}`}>
                                ({weekdayOf(row.workDate)})
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-800 dark:text-slate-200">
                              {row.userName ?? row.userId}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {formatClock(row.checkInAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {row.checkOutAt ? (
                                formatClock(row.checkOutAt)
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  근무 중
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                              {row.workMinutes === null ? '—' : formatMinutes(row.workMinutes)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                              {row.checklist.length === 0 ? (
                                '—'
                              ) : (
                                <span className={missed > 0 ? 'text-amber-600' : undefined}>
                                  {row.checklist.length - missed}/{row.checklist.length}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setExpanded(open ? null : row.id)}
                                aria-expanded={open}
                                aria-label={`${row.workDate} ${row.userName ?? row.userId} 확인 내용`}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                                />
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-slate-50 dark:bg-slate-800/40">
                              <td colSpan={7} className="px-3 pb-3">
                                {row.checklist.length === 0 ? (
                                  <p className="text-xs text-slate-500">확인 항목이 없었습니다.</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {row.checklist.map(answer => (
                                      <li
                                        key={answer.itemId}
                                        className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={
                                            answer.checked ? 'text-emerald-600' : 'text-rose-500'
                                          }
                                        >
                                          {answer.checked ? '☑' : '☐'}
                                        </span>
                                        <span className="min-w-0">
                                          {answer.label}
                                          {answer.required && (
                                            <span className="ml-1.5 text-xs text-slate-400">
                                              필수
                                            </span>
                                          )}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {row.note && (
                                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                    남긴 말: {row.note}
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(records.data?.totalPages ?? 1) > 1 && (
                <div className="mt-3">
                  <Pagination
                    pagination={{
                      currentPage: records.data?.page ?? 1,
                      totalPages: records.data?.totalPages ?? 1,
                      totalCount: records.data?.total ?? 0,
                      limit: PAGE_SIZE,
                      hasNextPage: (records.data?.page ?? 1) < (records.data?.totalPages ?? 1),
                      hasPrevPage: (records.data?.page ?? 1) > 1,
                    }}
                    currentPage={records.data?.page ?? 1}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </AdminSection>
      )}

      {view === 'summary' && (
        <AdminSection
          title="인원별 집계"
          actions={
            <div className="flex gap-1">
              {(
                [
                  { id: 'worked', label: '근무 많은 순' },
                  { id: 'name', label: '이름순' },
                ] as Array<{ id: SummarySort; label: string }>
              ).map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSummarySort(option.id)}
                  aria-pressed={summarySort === option.id}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    summarySort === option.id
                      ? 'bg-slate-800 font-medium text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        >
          {summary.isLoading ? (
            <LoadingSpinner message="집계 불러오는 중..." />
          ) : summary.isError ? (
            <ListState>집계를 불러오지 못했습니다.</ListState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">이름</th>
                    <th className="px-3 py-2 text-left font-medium">근무일</th>
                    <th className="px-3 py-2 text-left font-medium">총 근무</th>
                    <th className="px-3 py-2 text-left font-medium">하루 평균</th>
                    <th className="px-3 py-2 text-left font-medium">퇴근 안 찍음</th>
                    <th className="px-3 py-2 text-left font-medium">마지막 출근</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summaryRows.map(row => (
                    <tr key={row.userId} className={row.days === 0 ? 'text-slate-400' : undefined}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-800 dark:text-slate-200">
                        {row.userName}
                        <span className="ml-1.5 text-xs text-slate-400">{row.userId}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.days}일</td>
                      <td className="min-w-[140px] px-3 py-2">
                        <span className="tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMinutes(row.totalMinutes)}
                        </span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <span
                            className="block h-full rounded-full bg-primary-500/70"
                            style={{ width: `${Math.round((row.totalMinutes / summaryPeak) * 100)}%` }}
                          />
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                        {formatMinutes(row.averageMinutes)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.openDays > 0 ? (
                          <span className="text-amber-600">{row.openDays}일</span>
                        ) : (
                          '0일'
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                        {row.lastWorkDate ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminSection>
      )}

      {view === 'settings' && (
        <>
          <AdminSection title="출근 확인 항목">
            {settings.isLoading ? (
              <LoadingSpinner message="설정 불러오는 중..." />
            ) : (
              <ChecklistEditor
                items={settings.data?.checklist ?? []}
                adding={addItem.isPending}
                reordering={reorder.isPending}
                onAdd={data => addItem.mutate(data)}
                onPatch={(id, data) => patchItem.mutate({ id, data })}
                onReorder={ids => reorder.mutate(ids)}
                onDelete={item => setConfirmDelete(item)}
              />
            )}
          </AdminSection>

          {policy && (
            <AdminSection title="근무 설정">
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      하루 기준 근무 시간
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      오늘 얼마나 채웠는지를 이 값에 견주어 보여 줍니다. 판정에는 쓰이지 않습니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={STANDARD_MIN}
                      max={STANDARD_MAX}
                      step={30}
                      // 저장된 값이 바뀌면 다시 그린다. 실패했을 때 입력칸에
                      // 저장되지 않은 숫자가 남아 있으면 저장된 줄 알게 된다.
                      key={policy.standardWorkMinutes}
                      defaultValue={policy.standardWorkMinutes}
                      onBlur={e => {
                        const next = Number(e.target.value);
                        if (!Number.isInteger(next) || next < STANDARD_MIN || next > STANDARD_MAX) {
                          e.target.value = String(policy.standardWorkMinutes);
                          toast.error(`기준 근무 시간은 ${STANDARD_MIN}~${STANDARD_MAX}분 사이여야 합니다.`);
                          return;
                        }
                        if (next !== policy.standardWorkMinutes) {
                          savePolicy.mutate({ standardWorkMinutes: next });
                        }
                      }}
                      aria-label="하루 기준 근무 시간(분)"
                      className="input input-sm w-24 text-right"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      분 = {formatMinutes(policy.standardWorkMinutes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      필수 항목을 모두 체크해야 출근 기록
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      끄면 체크하지 않아도 출근이 되고, 체크하지 않은 사실이 기록에 남습니다.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={policy.requireChecklist}
                    onChange={value => savePolicy.mutate({ requireChecklist: value })}
                    label="필수 항목을 모두 체크해야 출근 기록"
                  />
                </div>
              </div>
            </AdminSection>
          )}
        </>
      )}

      <ConfirmationModal
        open={confirmDelete !== null}
        title="확인 항목 삭제"
        message={`'${confirmDelete?.label ?? ''}' 항목을 삭제합니다. 이미 찍힌 기록의 내용은 그대로 남습니다.`}
        confirmLabel="삭제"
        onConfirm={() => confirmDelete && removeItem.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

export default AttendanceManagement;
