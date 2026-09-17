import { useState } from 'react';
import { fetchLoginHistory } from '../../../api/admin';
import { LoginHistoryRecord } from '../../../types/admin.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { LogFilterBar, LogFilterField } from '../common/LogFilterBar';
import { VirtualLogTable, LogColumn } from '../common/VirtualLogTable';
import { formatDateTime } from '../../../utils/date';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useAdminLogQuery } from '../../../hooks/admin/useAdminLogQuery';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'success':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'locked':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  }
};

const statusLabel: Record<string, string> = {
  success: '성공',
  failed: '실패',
  locked: '잠금',
};

const COLUMNS: LogColumn[] = [
  { label: '일시', width: '170px' },
  { label: '사용자', width: '180px' },
  { label: 'IP / User Agent' },
  { label: '상태', width: '110px' },
  { label: '실패 사유', width: '180px' },
];

export const LoginHistoryManagement = () => {
  const [filterUserId, setFilterUserId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  // 자유 입력 필터는 디바운스 — 키 입력마다 API 호출하지 않도록
  const debouncedUserId = useDebouncedValue(filterUserId, 400);

  const { records, total, totalPages, loading, error, page, goPrev, goNext } =
    useAdminLogQuery<LoginHistoryRecord>({
      kind: 'login',
      filters: {
        userId: debouncedUserId,
        status: filterStatus,
        startDate: filterStartDate,
        endDate: filterEndDate,
      },
      fetcher: async (params, signal) => {
        const data = await fetchLoginHistory(params, signal);
        return {
          items: data.records ?? [],
          total: data.total ?? 0,
          totalPages: data.totalPages ?? 1,
        };
      },
    });

  if (loading && records.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="로그인 이력"
        actions={<span className="text-sm text-slate-500 dark:text-slate-400">총 {total}건</span>}
      >
        <LogFilterBar>
          <LogFilterField label="사용자 ID">
            <input
              type="text"
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
              placeholder="User ID"
              className="input"
            />
          </LogFilterField>
          <LogFilterField label="상태">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="input"
            >
              <option value="">전체</option>
              <option value="success">성공</option>
              <option value="failed">실패</option>
              <option value="locked">잠금</option>
            </select>
          </LogFilterField>
          <LogFilterField label="시작일">
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="input"
            />
          </LogFilterField>
          <LogFilterField label="종료일">
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="input"
            />
          </LogFilterField>
        </LogFilterBar>

        <VirtualLogTable
          columns={COLUMNS}
          rows={records}
          loading={loading}
          emptyMessage="로그인 이력이 없습니다."
          error={error}
          page={page}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
          renderRow={record => (
            <>
              <td className="admin-td whitespace-nowrap">{formatDateTime(record.createdAt)}</td>
              <td className="admin-td whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="font-semibold">{record.userName ?? '알 수 없음'}</span>
                  <span className="text-xs text-slate-400">{record.userId}</span>
                </div>
              </td>
              <td className="admin-td whitespace-nowrap">
                <div className="flex flex-col max-w-[200px]">
                  <span className="font-mono text-xs">{record.ipAddress ?? '-'}</span>
                  <span className="text-xs truncate text-slate-400" title={record.userAgent ?? ''}>
                    {record.userAgent ?? '-'}
                  </span>
                </div>
              </td>
              <td className="admin-td whitespace-nowrap">
                <span
                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(record.status)}`}
                >
                  {statusLabel[record.status] ?? record.status}
                </span>
              </td>
              <td className="admin-td">{record.failureReason ?? '-'}</td>
            </>
          )}
        />
      </AdminSection>
    </div>
  );
};

export default LoginHistoryManagement;
