import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteSecurityLogs, exportSecurityLogs, fetchSecurityLogs } from '../../../api/admin';
import { adminKeys } from '../../../api/queryKeys';
import { toast } from '../../../utils/toast';
import { SecurityLog } from '../../../types/admin.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { LogFilterBar, LogFilterField } from '../common/LogFilterBar';
import { VirtualLogTable, LogColumn } from '../common/VirtualLogTable';
import { formatDateTime } from '../../../utils/date';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useAdminLogQuery } from '../../../hooks/admin/useAdminLogQuery';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'SUCCESS':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'FAILURE':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'WARNING':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  }
};

const COLUMNS: LogColumn[] = [
  { label: 'Time', width: '170px' },
  { label: 'Action' },
  { label: 'User', width: '170px' },
  { label: 'IP / Agent', width: '210px' },
  { label: 'Status', width: '120px' },
  { label: 'Details', width: '96px' },
];

export const SecurityLogManagement = () => {
  const queryClient = useQueryClient();

  const [filterUserId, setFilterUserId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterIp, setFilterIp] = useState('');
  // 자유 입력 필터는 디바운스 — 키 입력마다 API 호출하지 않도록
  const debouncedUserId = useDebouncedValue(filterUserId, 400);
  const debouncedIp = useDebouncedValue(filterIp, 400);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const {
    records: logs,
    total: totalLogs,
    totalPages,
    loading,
    error,
    page,
    setPage,
    goPrev,
    goNext,
  } = useAdminLogQuery<SecurityLog>({
    kind: 'security',
    filters: { userId: debouncedUserId, action: filterAction, ipAddress: debouncedIp },
    fetcher: async (params, signal) => {
      const data = await fetchSecurityLogs(params, signal);
      return { items: data.logs ?? [], total: data.total ?? 0, totalPages: data.totalPages ?? 1 };
    },
  });

  const toggleExpand = (id: string) => setExpandedLogId(expandedLogId === id ? null : id);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportSecurityLogs();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'security-logs.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  };

  /** 특정 날짜 이전 로그 삭제 또는 전체 삭제 */
  const handleDelete = async (mode: '30d' | '90d' | 'all') => {
    const labels: Record<string, string> = {
      '30d': '30일 이전 보안 로그',
      '90d': '90일 이전 보안 로그',
      all: '모든 보안 로그',
    };
    if (!window.confirm(`${labels[mode]}를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`))
      return;

    setDeleting(true);
    try {
      const options: { before?: string } = {};
      if (mode !== 'all') {
        const days = mode === '30d' ? 30 : 90;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        options.before = cutoff.toISOString();
      }
      const result = await deleteSecurityLogs(options);
      toast.success(`${result.deleted}건의 보안 로그가 삭제되었습니다.`);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: adminKeys.logs.all });
    } catch {
      toast.error('보안 로그 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && logs.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="보안 로그"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? '내보내는 중...' : 'Excel 내보내기'}
            </button>
            <span className="text-sm text-slate-500">총 {totalLogs}건</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">삭제:</span>
              <button
                onClick={() => handleDelete('30d')}
                disabled={deleting}
                className="rounded-md px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
              >
                30일 이전
              </button>
              <button
                onClick={() => handleDelete('90d')}
                disabled={deleting}
                className="rounded-md px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
              >
                90일 이전
              </button>
              <button
                onClick={() => handleDelete('all')}
                disabled={deleting}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
              >
                전체 삭제
              </button>
            </div>
          </div>
        }
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
          <LogFilterField label="Action">
            <input
              type="text"
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              placeholder="LOGIN_SUCCESS, etc."
              className="input"
            />
          </LogFilterField>
          <LogFilterField label="IP Address">
            <input
              type="text"
              value={filterIp}
              onChange={e => setFilterIp(e.target.value)}
              placeholder="127.0.0.1"
              className="input"
            />
          </LogFilterField>
        </LogFilterBar>

        <VirtualLogTable
          columns={COLUMNS}
          rows={logs}
          loading={loading}
          emptyMessage="보안 로그가 없습니다."
          error={error}
          page={page}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
          estimateRowHeight={52}
          dynamicRowHeight
          renderRow={log => (
            <>
              <td className="admin-td whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
              <td className="admin-td whitespace-nowrap font-medium text-slate-900 dark:text-white">
                <div className="flex flex-col">
                  <span>{log.action}</span>
                  <span className="text-xs text-slate-400 font-mono">
                    {log.method} {log.route}
                  </span>
                </div>
              </td>
              <td className="admin-td whitespace-nowrap">
                {log.user ? (
                  <div className="flex flex-col">
                    <span className="font-semibold">{log.user.name}</span>
                    <span className="text-xs text-slate-400">{log.userId}</span>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Guest / System</span>
                )}
              </td>
              <td className="admin-td whitespace-nowrap">
                <div className="flex flex-col max-w-[150px]">
                  <span className="font-mono">{log.ipAddress}</span>
                  <span className="text-xs truncate" title={log.userAgent}>
                    {log.userAgent}
                  </span>
                </div>
              </td>
              <td className="admin-td whitespace-nowrap">
                <span
                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(log.status)}`}
                >
                  {log.status === 'WARNING' ? '3XX (REDIR)' : log.status}
                </span>
              </td>
              <td className="admin-td whitespace-nowrap">
                <button
                  onClick={() => toggleExpand(log.id)}
                  className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 text-xs underline"
                >
                  {expandedLogId === log.id ? '접기' : '상세보기'}
                </button>
              </td>
            </>
          )}
          renderExpandedRow={log =>
            expandedLogId === log.id ? (
              <tr className="bg-slate-50 dark:bg-slate-900/50">
                <td colSpan={6} className="admin-td">
                  <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700">
                    {log.details ? JSON.stringify(log.details, null, 2) : 'No details available'}
                  </pre>
                </td>
              </tr>
            ) : null
          }
        />
      </AdminSection>
    </div>
  );
};

export default SecurityLogManagement;
