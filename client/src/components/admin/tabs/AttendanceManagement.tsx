// client/src/components/admin/tabs/AttendanceManagement.tsx
// 출퇴근 — 오늘 현황, 기간별 기록, 인원별 집계, 확인 항목·설정.
//
// 기록에 남은 확인 내용은 그날 찍힌 문구 그대로다. 항목을 고쳐도 지난 기록은
// 바뀌지 않는다.

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, ChevronDown, ChevronLeft } from 'lucide-react';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { ListState } from '../../common/ListState';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import { Pagination } from '../../boards/Pagination';
import { TodayBoardView } from '../attendance/TodayBoardView';
import { ChecklistEditor } from '../attendance/ChecklistEditor';
import { SummaryChart } from '../attendance/SummaryChart';
import { DailyChart } from '../attendance/DailyChart';
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
  shiftDay,
  todayString,
  weekdayOf,
  weekdayTone,
} from '../../../utils/attendance';
import type { AttendancePolicy, ChecklistItem } from '../../../types/attendance.types';

interface AttendanceSettings {
  checklist: ChecklistItem[];
  policy: AttendancePolicy;
}

type View = 'today' | 'period' | 'settings';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'today', label: '오늘' },
  { id: 'period', label: '기간별' },
  { id: 'settings', label: '확인 항목·설정' },
];

/** 인원별 표에서 고를 수 있는 정렬 기준 */
type SortKey = 'name' | 'days' | 'total' | 'average' | 'open' | 'last';
const SORTS: Array<{ key: SortKey; label: string; numeric: boolean }> = [
  { key: 'name', label: '이름', numeric: false },
  { key: 'days', label: '근무일', numeric: true },
  { key: 'total', label: '총 근무', numeric: true },
  { key: 'average', label: '하루 평균', numeric: true },
  { key: 'open', label: '퇴근 안 찍음', numeric: true },
  // 날짜지만 최근 것부터 보는 게 자연스러워 숫자 칸처럼 내림차순으로 시작한다
  { key: 'last', label: '마지막 출근', numeric: true },
];

const PAGE_SIZE = 30;

// 서버(attendance.service)의 검증 범위와 같아야 한다
const STANDARD_MIN = 30;
const STANDARD_MAX = 1440;

/** 오늘 현황은 근무 중인 사람의 시간이 흐르므로 짧게 다시 읽는다 */
const TODAY_REFRESH_MS = 60_000;

function monthStart(): string {
  return `${todayString().slice(0, 7)}-01`;
}

/**
 * 자주 쓰는 기간. 날짜 두 칸을 직접 고르는 것보다 이쪽이 대부분의 경우다.
 * 눌렀을 때 시작일·종료일 칸도 함께 바뀌므로 지금 보는 기간이 그대로 보인다.
 */
const RANGE_PRESETS: Array<{
  id: string;
  label: string;
  range: () => { from: string; to: string };
}> = [
  { id: 'today', label: '오늘', range: () => ({ from: todayString(), to: todayString() }) },
  {
    id: 'yesterday',
    label: '어제',
    range: () => {
      const day = shiftDay(todayString(), -1);
      return { from: day, to: day };
    },
  },
  {
    id: 'week',
    label: '최근 7일',
    range: () => ({ from: shiftDay(todayString(), -6), to: todayString() }),
  },
  { id: 'month', label: '이번 달', range: () => ({ from: monthStart(), to: todayString() }) },
];

function PeriodStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {hint && <p className="mt-0.5 text-2xs text-slate-400">{hint}</p>}
    </div>
  );
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
  // 표 정렬 — 기본은 많이 일한 순. 이름순이면 근무한 사람이 0일인 사람들 사이에 묻힌다.
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'total', desc: true });

  const toggleSort = (key: SortKey) =>
    setSort(prev =>
      prev.key === key
        ? { key, desc: !prev.desc }
        : // 숫자 칸은 큰 값부터, 글자 칸은 가나다순부터가 자연스럽다
          { key, desc: SORTS.find(c => c.key === key)?.numeric ?? false }
    );

  const range = useMemo(() => ({ from, to }), [from, to]);

  const { data: users = [] } = useQuery({
    queryKey: adminKeys.users.all,
    queryFn: fetchAdminUsers,
    enabled: view === 'period',
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
    // 사람을 고르기 전에는 인원별 요약만 보여준다 — 전체 기록을 한 줄씩 늘어놓아도 읽히지 않는다
    enabled: view === 'period' && !!userId,
    // 페이지·기간을 바꿀 때 표가 비었다가 다시 차면 화면이 튄다 — 새 값이 올 때까지 둔다
    placeholderData: prev => prev,
  });

  // 그래프용 — 표는 페이지로 끊기지만 그래프는 기간 전체를 그려야 한다.
  // 한 사람의 기록은 하루 한 건이라 기간 상한(366일)이면 한 번에 다 온다.
  const chartRecords = useQuery({
    queryKey: adminKeys.attendance.records({ ...range, userId, chart: true }),
    queryFn: () => fetchAttendanceRecords({ ...range, userId, page: 1, limit: 366 }),
    enabled: view === 'period' && !!userId,
    placeholderData: prev => prev,
  });

  const summary = useQuery({
    queryKey: adminKeys.attendance.summary(range),
    queryFn: () => fetchAttendanceSummary(range),
    enabled: view === 'period',
    placeholderData: prev => prev,
  });

  // 기준 근무 시간은 그래프의 눈금이라 설정 화면이 아닐 때도 필요하다
  const settings = useQuery({
    queryKey: adminKeys.attendance.settings,
    queryFn: fetchAttendanceSettings,
    staleTime: 5 * 60_000,
  });

  const invalidateSettings = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.attendance.settings });

  /**
   * 화면을 먼저 바꾸고 요청을 보낸다.
   *
   * 체크 한 번에 서버 왕복과 재조회를 기다리면, 네트워크가 느린 만큼 체크박스가
   * 늦게 움직인다. 실패하면 이전 값으로 되돌리고, onSettled 의 재조회가 최종 확인이다.
   */
  const applyOptimistic = async (update: (current: AttendanceSettings) => AttendanceSettings) => {
    await queryClient.cancelQueries({ queryKey: adminKeys.attendance.settings });
    const previous = queryClient.getQueryData<AttendanceSettings>(adminKeys.attendance.settings);
    if (previous) {
      queryClient.setQueryData<AttendanceSettings>(adminKeys.attendance.settings, update(previous));
    }
    return { previous };
  };

  const rollback = (context?: { previous?: AttendanceSettings }) => {
    if (context?.previous) {
      queryClient.setQueryData(adminKeys.attendance.settings, context.previous);
    }
  };

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
    onMutate: ({ id, data }) =>
      applyOptimistic(current => ({
        ...current,
        checklist: current.checklist.map(item => (item.id === id ? { ...item, ...data } : item)),
      })),
    onError: (err, _vars, context) => {
      rollback(context);
      onMutationError('항목을 수정하지 못했습니다.')(err);
    },
    // 실패해도 서버 값으로 되돌려야 화면과 저장된 값이 갈라지지 않는다
    onSettled: () => invalidateSettings(),
  });

  const reorder = useMutation({
    mutationFn: reorderChecklist,
    onMutate: ids =>
      applyOptimistic(current => {
        const byId = new Map(current.checklist.map(item => [item.id, item]));
        const next = ids.map(id => byId.get(id)).filter((item): item is ChecklistItem => !!item);
        // 목록과 안 맞는 순서는 서버가 거절한다 — 화면을 섣불리 바꾸지 않는다
        return next.length === current.checklist.length ? { ...current, checklist: next } : current;
      }),
    onError: (err, _vars, context) => {
      rollback(context);
      onMutationError('순서를 바꾸지 못했습니다.')(err);
    },
    onSettled: () => invalidateSettings(),
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
    onMutate: data =>
      applyOptimistic(current => ({ ...current, policy: { ...current.policy, ...data } })),
    onSuccess: () => toast.success('설정이 저장되었습니다.'),
    onError: (err, _vars, context) => {
      rollback(context);
      onMutationError('설정을 저장하지 못했습니다.')(err);
    },
    onSettled: () => invalidateSettings(),
  });

  const policy = settings.data?.policy;
  // 총 근무가 가장 긴 사람을 눈금으로 삼아 막대를 그린다
  const summaryPeak = Math.max(1, ...(summary.data ?? []).map(r => r.totalMinutes));

  // 기본은 많이 일한 순. 이름순이면 근무한 사람이 0일인 사람들 사이에 묻힌다.
  const standard = settings.data?.policy.standardWorkMinutes ?? 480;

  /** 기간 전체를 한 줄로 — 표를 읽기 전에 규모부터 잡힌다 */
  const periodTotals = useMemo(() => {
    const rows = summary.data ?? [];
    const worked = rows.filter(r => r.days > 0);
    const totalMinutes = rows.reduce((sum, r) => sum + r.totalMinutes, 0);
    const totalDays = rows.reduce((sum, r) => sum + r.days, 0);
    const closedDays = totalDays - rows.reduce((sum, r) => sum + r.openDays, 0);
    return {
      people: worked.length,
      absent: rows.length - worked.length,
      totalMinutes,
      averageMinutes: closedDays > 0 ? Math.round(totalMinutes / closedDays) : 0,
      totalDays,
    };
  }, [summary.data]);

  /** 드릴다운에서 보여줄 그 사람의 기간 요약 — 표만 늘어놓으면 규모가 안 잡힌다 */
  const personSummary = useMemo(
    () => (summary.data ?? []).find(r => r.userId === userId) ?? null,
    [summary.data, userId]
  );

  const summaryRows = useMemo(() => {
    const rows = [...(summary.data ?? [])];
    const dir = sort.desc ? -1 : 1;
    const value = (r: (typeof rows)[number]) => {
      switch (sort.key) {
        case 'days':
          return r.days;
        case 'total':
          return r.totalMinutes;
        case 'average':
          return r.averageMinutes;
        case 'open':
          return r.openDays;
        case 'last':
          return r.lastWorkDate ?? '';
        default:
          return r.userName;
      }
    };
    return rows.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir || a.userName.localeCompare(b.userName);
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [summary.data, sort]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              // 탭을 옮겼다 오면 전체 목록부터 — 지난번에 보던 사람이 남아 있으면
              // 왜 한 사람만 나오는지 알 수 없다
              setView(v.id);
              setUserId('');
              setPage(1);
            }}
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
            <ListState>{getApiErrorMessage(board.error, '현황을 불러오지 못했습니다.')}</ListState>
          ) : board.data ? (
            <TodayBoardView
              board={board.data}
              onSelectUser={id => {
                // 오늘 화면에서 사람을 누르면 그대로 그 사람 기록으로 — 탭을 옮겨
                // 다시 찾게 하지 않는다
                setUserId(id);
                setPage(1);
                setView('period');
              }}
            />
          ) : null}
        </AdminSection>
      )}

      {view === 'period' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_PRESETS.map(preset => {
            const { from: pFrom, to: pTo } = preset.range();
            const active = from === pFrom && to === pTo;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFrom(pFrom);
                  setTo(pTo);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  active
                    ? 'bg-slate-800 font-medium text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          {records.isFetching || summary.isFetching ? (
            <span className="ml-1 text-xs text-slate-400">불러오는 중…</span>
          ) : null}
        </div>
      )}

      {view === 'period' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="시작일">
            <input
              type="date"
              value={from}
              max={to}
              onChange={e => {
                // 비우면 화면은 빈칸인데 서버는 이번 달을 돌려준다 — 어긋나지 않게 되돌린다
                setFrom(e.target.value || monthStart());
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
                setTo(e.target.value || todayString());
                setPage(1);
              }}
              className="input input-sm w-full"
            />
          </Field>
        </div>
      )}

      {view === 'period' && userId && (
        <AdminSection
          title={`${users.find(u => u.id === userId)?.name ?? userId} · ${records.data?.total ?? 0}건`}
          actions={
            <button
              type="button"
              onClick={() => {
                setUserId('');
                setPage(1);
              }}
              className="btn-secondary inline-flex items-center gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
              전체 보기
            </button>
          }
        >
          {records.isLoading ? (
            <LoadingSpinner message="기록 불러오는 중..." />
          ) : records.isError ? (
            <ListState>
              {getApiErrorMessage(records.error, '기록을 불러오지 못했습니다.')}
            </ListState>
          ) : (records.data?.records?.length ?? 0) === 0 ? (
            <ListState size="roomy">이 기간에는 기록이 없습니다.</ListState>
          ) : (
            <>
              {personSummary && (
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <PeriodStat label="근무일" value={`${personSummary.days}일`} />
                  <PeriodStat label="총 근무" value={formatMinutes(personSummary.totalMinutes)} />
                  <PeriodStat
                    label="하루 평균"
                    value={formatMinutes(personSummary.averageMinutes)}
                    hint={`기준 ${formatMinutes(standard)}`}
                  />
                  <PeriodStat
                    label="기준 대비"
                    value={
                      personSummary.averageMinutes > 0
                        ? `${Math.round((personSummary.averageMinutes / Math.max(1, standard)) * 100)}%`
                        : '—'
                    }
                  />
                  <PeriodStat
                    label="퇴근 안 찍음"
                    value={`${personSummary.openDays}일`}
                    hint={personSummary.openDays > 0 ? '그날은 시간이 안 잡힙니다' : undefined}
                  />
                </div>
              )}

              <DailyChart
                records={chartRecords.data?.records ?? []}
                from={from}
                to={to}
                standardWorkMinutes={standard}
              />
              <div className="overflow-x-auto" aria-live="polite" aria-busy={records.isFetching}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">날짜</th>
                      <th className="px-3 py-2 text-left font-medium">출근</th>
                      <th className="px-3 py-2 text-left font-medium">퇴근</th>
                      <th className="px-3 py-2 text-left font-medium">근무</th>
                      <th className="px-3 py-2 text-left font-medium">확인</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(records.data?.records ?? []).map(row => {
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
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {formatClock(row.checkInAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                              {row.checkOutAt ? (
                                formatClock(row.checkOutAt)
                              ) : row.workDate === todayString() ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  근무 중
                                </span>
                              ) : (
                                // 지난 날짜인데 퇴근이 없으면 지금 일하는 중이 아니다
                                <span className="text-amber-600 dark:text-amber-400">
                                  퇴근 안 찍음
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
                              <td colSpan={6} className="px-3 pb-3">
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

      {view === 'period' && !userId && (
        <AdminSection title="인원별 집계">
          {summary.isLoading ? (
            <LoadingSpinner message="집계 불러오는 중..." />
          ) : summary.isError ? (
            <ListState>
              {getApiErrorMessage(summary.error, '집계를 불러오지 못했습니다.')}
            </ListState>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <PeriodStat
                  label="근무한 인원"
                  value={`${periodTotals.people}명`}
                  hint={periodTotals.absent > 0 ? `기록 없음 ${periodTotals.absent}명` : undefined}
                />
                <PeriodStat label="근무일 합계" value={`${periodTotals.totalDays}일`} />
                <PeriodStat label="총 근무" value={formatMinutes(periodTotals.totalMinutes)} />
                <PeriodStat
                  label="하루 평균"
                  value={formatMinutes(periodTotals.averageMinutes)}
                  hint={`기준 ${formatMinutes(standard)}`}
                />
              </div>

              <SummaryChart rows={summaryRows} standardWorkMinutes={standard} />

              <div className="overflow-x-auto" aria-live="polite" aria-busy={summary.isFetching}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      {SORTS.map(col => (
                        <th key={col.key} className="px-3 py-2 text-left font-medium">
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            aria-label={`${col.label} 기준으로 정렬`}
                            className={`inline-flex items-center gap-0.5 hover:text-slate-700 dark:hover:text-slate-200 ${
                              sort.key === col.key ? 'text-slate-800 dark:text-slate-100' : ''
                            }`}
                          >
                            {col.label}
                            {sort.key === col.key && (
                              <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                            )}
                            {sort.key === col.key && (
                              <span className="sr-only">{sort.desc ? '내림차순' : '오름차순'}</span>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {summaryRows.map(row => (
                      <tr
                        key={row.userId}
                        className={row.days === 0 ? 'text-slate-400' : undefined}
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setUserId(row.userId);
                              setPage(1);
                            }}
                            className="text-left text-slate-800 hover:text-primary-600 hover:underline dark:text-slate-200 dark:hover:text-primary-400"
                          >
                            {row.userName}
                            <span className="ml-1.5 text-xs text-slate-400">{row.userId}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.days}일</td>
                        <td className="min-w-[140px] px-3 py-2">
                          <span className="tabular-nums text-slate-700 dark:text-slate-300">
                            {formatMinutes(row.totalMinutes)}
                          </span>
                          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <span
                              className="block h-full rounded-full bg-primary-500/70"
                              style={{
                                width: `${Math.round((row.totalMinutes / summaryPeak) * 100)}%`,
                              }}
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
            </>
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
                      진행률 표시에만 씁니다. 지각·초과 근무 판정은 하지 않습니다.
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
                          toast.error(
                            `기준 근무 시간은 ${STANDARD_MIN}~${STANDARD_MAX}분 사이여야 합니다.`
                          );
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
                      출근 시각 보정
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      자리에 앉아 컴퓨터를 켜는 시간을 인정해, 출근을 이만큼 앞당겨 기록합니다. 0
                      이면 누른 그대로 남습니다. 실제 근무 기록이 바뀌는 값입니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      // 서버도 0~60 으로 막는다(attendance.service.updatePolicy).
                      // 한 시간을 넘겨 당기면 보정이 아니라 기록을 지어내는 것이다.
                      max={60}
                      key={policy.checkInGraceMinutes}
                      defaultValue={policy.checkInGraceMinutes}
                      onBlur={e => {
                        const next = Number(e.target.value);
                        if (!Number.isInteger(next) || next < 0 || next > 60) {
                          e.target.value = String(policy.checkInGraceMinutes);
                          toast.error('출근 시각 보정은 0~60분 사이여야 합니다.');
                          return;
                        }
                        if (next !== policy.checkInGraceMinutes) {
                          savePolicy.mutate({ checkInGraceMinutes: next });
                        }
                      }}
                      aria-label="출근 시각 보정(분)"
                      className="input input-sm w-24 text-right"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">분 일찍</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    출근 확인 화면 안내 문구
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    직원이 보는 화면 머리글에 그대로 나옵니다. 비우면 기본 문구로 돌아갑니다.
                  </p>
                  <input
                    key={policy.noticeText}
                    defaultValue={policy.noticeText}
                    maxLength={300}
                    onBlur={e => {
                      const next = e.target.value.trim();
                      if (next !== policy.noticeText) savePolicy.mutate({ noticeText: next });
                    }}
                    aria-label="출근 확인 화면 안내 문구"
                    className="input input-sm mt-2 w-full"
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      필수 항목을 모두 체크해야 출근 기록
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      끄면 체크 없이도 출근됩니다. 체크하지 않은 항목은 기록에 남습니다.
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
        message={`'${confirmDelete?.label ?? ''}' 항목을 삭제합니다. 이미 기록된 내용은 남습니다.`}
        confirmLabel="삭제"
        onConfirm={() => confirmDelete && removeItem.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};

export default AttendanceManagement;
