// client/src/components/admin/tabs/AttendanceManagement.tsx
// 출퇴근 — 기록 조회, 인원별 집계, 출근 확인 항목·판정 기준 관리.
//
// 기록에 남은 확인 내용은 그날 찍힌 문구 그대로다. 항목을 나중에 고쳐도
// 지난 기록의 문구는 바뀌지 않는다.

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { AdminSection } from '../common/AdminSection';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { ListState } from '../../common/ListState';
import { ToggleSwitch } from '../../common/ToggleSwitch';
import { Pagination } from '../../boards/Pagination';
import { adminKeys } from '../../../api/queryKeys';
import { fetchAdminUsers } from '../../../api/admin';
import {
  createChecklistItem,
  deleteChecklistItem,
  fetchAttendanceRecords,
  fetchAttendanceSettings,
  fetchAttendanceSummary,
  updateAttendancePolicy,
  updateChecklistItem,
} from '../../../api/attendance';
import { getApiErrorMessage } from '../../../api/utils';
import { toast } from '../../../utils/toast';
import {
  checkInLabel,
  checkOutLabel,
  formatClock,
  formatMinutes,
  todayString,
} from '../../../utils/attendance';
import type { ChecklistItem } from '../../../types/attendance.types';

type View = 'records' | 'summary' | 'settings';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'records', label: '기록' },
  { id: 'summary', label: '인원별' },
  { id: 'settings', label: '확인 항목·기준' },
];

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
  const [view, setView] = useState<View>('records');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayString);
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const range = useMemo(() => ({ from, to }), [from, to]);

  const { data: users = [] } = useQuery({
    queryKey: adminKeys.users.all,
    queryFn: fetchAdminUsers,
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

  const addItem = useMutation({
    mutationFn: createChecklistItem,
    onSuccess: () => {
      setNewLabel('');
      setNewDescription('');
      invalidateSettings();
      toast.success('확인 항목이 추가되었습니다.');
    },
    onError: err => toast.error(getApiErrorMessage(err, '항목을 추가하지 못했습니다.')),
  });

  const patchItem = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ChecklistItem> }) =>
      updateChecklistItem(id, data),
    onSuccess: () => invalidateSettings(),
    onError: err => toast.error(getApiErrorMessage(err, '항목을 수정하지 못했습니다.')),
  });

  const removeItem = useMutation({
    mutationFn: deleteChecklistItem,
    onSuccess: () => {
      setConfirmDelete(null);
      invalidateSettings();
      toast.success('확인 항목이 삭제되었습니다.');
    },
    onError: err => {
      setConfirmDelete(null);
      toast.error(getApiErrorMessage(err, '항목을 삭제하지 못했습니다.'));
    },
  });

  const savePolicy = useMutation({
    mutationFn: updateAttendancePolicy,
    onSuccess: () => {
      invalidateSettings();
      toast.success('기준이 저장되었습니다.');
    },
    onError: err => toast.error(getApiErrorMessage(err, '기준을 저장하지 못했습니다.')),
  });

  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRequired, setNewRequired] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<ChecklistItem | null>(null);

  const policy = settings.data?.policy;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
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

      {view !== 'settings' && (
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
        <AdminSection
          title="출퇴근 기록"
          description="기간과 사람으로 걸러 봅니다. 행을 누르면 그날 확인한 내용이 펼쳐집니다."
        >
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {records.data?.records.map(row => (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                            {row.workDate}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-800 dark:text-slate-200">
                            {row.userName ?? row.userId}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {formatClock(row.checkInAt)}
                            {row.checkInStatus === 'late' && (
                              <span className="ml-1.5 text-xs text-amber-600">
                                {checkInLabel.late}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {row.checkOutAt ? formatClock(row.checkOutAt) : '—'}
                            {row.checkOutStatus === 'early' && (
                              <span className="ml-1.5 text-xs text-amber-600">
                                {checkOutLabel.early}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                            {row.workMinutes === null ? '—' : formatMinutes(row.workMinutes)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                            {row.checklist.filter(c => c.checked).length}/{row.checklist.length}
                          </td>
                        </tr>
                        {expanded === row.id && (
                          <tr className="bg-slate-50 dark:bg-slate-800/40">
                            <td colSpan={6} className="px-3 py-3">
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
                    ))}
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
                      limit: 30,
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
          description="기간 안에 한 번도 찍지 않은 사람도 0일로 나옵니다."
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
                    <th className="px-3 py-2 text-left font-medium">지각</th>
                    <th className="px-3 py-2 text-left font-medium">조기 퇴근</th>
                    <th className="px-3 py-2 text-left font-medium">총 근무</th>
                    <th className="px-3 py-2 text-left font-medium">마지막 출근</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.data?.map(row => (
                    <tr key={row.userId}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-800 dark:text-slate-200">
                        {row.userName}
                        <span className="ml-1.5 text-xs text-slate-400">{row.userId}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.days}일</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.lateDays > 0 ? (
                          <span className="text-amber-600">{row.lateDays}일</span>
                        ) : (
                          '0일'
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.earlyLeaveDays}일</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {formatMinutes(row.totalMinutes)}
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
          <AdminSection
            title="출근 확인 항목"
            description="출근을 누르면 이 항목들이 뜹니다. 필수 항목을 체크하지 않으면 출근이 기록되지 않습니다."
          >
            {settings.isLoading ? (
              <LoadingSpinner message="설정 불러오는 중..." />
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  {(settings.data?.checklist.length ?? 0) === 0 ? (
                    <ListState>등록된 확인 항목이 없습니다.</ListState>
                  ) : (
                    settings.data?.checklist.map(item => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800"
                      >
                        <input
                          defaultValue={item.label}
                          onBlur={e => {
                            const label = e.target.value.trim();
                            if (label && label !== item.label) {
                              patchItem.mutate({ id: item.id, data: { label } });
                            } else {
                              e.target.value = item.label;
                            }
                          }}
                          className="input input-sm min-w-0 flex-1"
                          aria-label="항목 내용"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={e =>
                              patchItem.mutate({
                                id: item.id,
                                data: { required: e.target.checked },
                              })
                            }
                          />
                          필수
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={item.isActive}
                            onChange={e =>
                              patchItem.mutate({
                                id: item.id,
                                data: { isActive: e.target.checked },
                              })
                            }
                          />
                          사용
                        </label>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(item)}
                          aria-label={`${item.label} 삭제`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="항목 내용">
                      <input
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        maxLength={200}
                        placeholder="예) 보안 수칙을 확인했습니다."
                        className="input input-sm w-full"
                      />
                    </Field>
                    <Field label="설명 (선택)">
                      <input
                        value={newDescription}
                        onChange={e => setNewDescription(e.target.value)}
                        maxLength={500}
                        placeholder="항목 아래에 작게 표시됩니다."
                        className="input input-sm w-full"
                      />
                    </Field>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={newRequired}
                        onChange={e => setNewRequired(e.target.checked)}
                      />
                      체크해야 출근할 수 있는 필수 항목
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        addItem.mutate({
                          label: newLabel,
                          description: newDescription,
                          required: newRequired,
                        })
                      }
                      disabled={!newLabel.trim() || addItem.isPending}
                      className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                      추가
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AdminSection>

          {policy && (
            <AdminSection
              title="판정 기준"
              description="출근 시각이 기준+유예를 넘으면 지각, 퇴근이 기준보다 이르면 조기 퇴근으로 남습니다."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="출근 기준 시각">
                  <input
                    type="time"
                    defaultValue={policy.workStartTime}
                    onBlur={e => savePolicy.mutate({ workStartTime: e.target.value })}
                    className="input input-sm w-full"
                  />
                </Field>
                <Field label="퇴근 기준 시각">
                  <input
                    type="time"
                    defaultValue={policy.workEndTime}
                    onBlur={e => savePolicy.mutate({ workEndTime: e.target.value })}
                    className="input input-sm w-full"
                  />
                </Field>
                <Field label="지각 유예 (분)">
                  <input
                    type="number"
                    min={0}
                    max={240}
                    defaultValue={policy.graceMinutes}
                    onBlur={e => savePolicy.mutate({ graceMinutes: Number(e.target.value) })}
                    className="input input-sm w-full"
                  />
                </Field>
              </div>
              <div className="mt-4 flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
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
