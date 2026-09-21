import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deleteErrorLogs, fetchErrorLogs } from '../../../api/admin';
import { adminKeys } from '../../../api/queryKeys';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { LogFilterBar, LogFilterField } from '../common/LogFilterBar';
import { toast } from '../../../utils/toast';
import { formatDateShort } from '../../../utils/date';
import { useAdminLogQuery } from '../../../hooks/admin/useAdminLogQuery';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { ListState } from '../../common/ListState';
import { ConfirmationModal } from '../common/ConfirmationModal';

type ErrorLog = {
  id: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  route: string;
  method: string;
  errorCode: string;
  errorMessage: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  requestBody?: Record<string, unknown> | null;
  createdAt: string;
};

const getSeverityBadge = (severity: string) => {
  switch (severity) {
    case 'info':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'warning':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'error':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'critical':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  }
};

type DeleteMode = '7d' | '30d' | 'severity' | 'all';

export const ErrorLogManagement = () => {
  const queryClient = useQueryClient();

  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  // 브라우저 기본 confirm 은 화면 밖(창 위)에 뜨고 다크 모드도 따르지 않는다.
  // 지우는 동작 17곳이 이미 공용 확인 상자를 쓴다 — 여기도 같은 것을 쓴다.
  const [pendingDelete, setPendingDelete] = useState<DeleteMode | null>(null);
  // 자유 입력 필터는 디바운스 — 다른 로그 탭과 동일하게 키 입력마다 조회하지 않는다
  const debouncedUserId = useDebouncedValue(filterUserId, 400);

  const {
    records: logs,
    total: totalLogs,
    totalPages,
    loading,
    error,
    page,
    setPage,
  } = useAdminLogQuery<ErrorLog>({
    kind: 'error',
    filters: {
      severity: filterSeverity,
      userId: debouncedUserId,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
    },
    fetcher: async (params, signal) => {
      const data = await fetchErrorLogs(params, signal);
      return {
        items: data.logs ?? [],
        total: data.pagination?.total ?? 0,
        totalPages: data.pagination?.totalPages ?? 1,
      };
    },
  });

  const deleteLabels: Record<DeleteMode, string> = {
    '7d': '7일 이전 에러 로그',
    '30d': '30일 이전 에러 로그',
    severity: filterSeverity ? `심각도 "${filterSeverity}" 에러 로그 전체` : '(심각도 미선택)',
    all: '모든 에러 로그',
  };

  /** 삭제 전 확인 상자를 연다 */
  const askDelete = (mode: DeleteMode) => {
    if (mode === 'severity' && !filterSeverity) {
      toast.error('삭제할 심각도를 먼저 선택해주세요.');
      return;
    }
    setPendingDelete(mode);
  };

  /** 에러 로그 삭제 */
  const handleDelete = async (mode: DeleteMode) => {
    setDeleting(true);
    try {
      const options: { before?: string; severity?: string; all?: boolean } = {};
      if (mode === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        options.before = d.toISOString();
      } else if (mode === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        options.before = d.toISOString();
      } else if (mode === 'severity') {
        options.severity = filterSeverity;
      } else if (mode === 'all') {
        options.all = true;
      }
      const result = await deleteErrorLogs(options);
      toast.success(`${result.deleted}건의 에러 로그가 삭제되었습니다.`);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: adminKeys.logs.all });
    } catch {
      toast.error('에러 로그 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  if (loading && logs.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="에러 로그"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-500">총 {totalLogs}건</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">삭제:</span>
              <button
                onClick={() => askDelete('7d')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded transition-colors disabled:opacity-50"
              >
                7일 이전
              </button>
              <button
                onClick={() => askDelete('30d')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded transition-colors disabled:opacity-50"
              >
                30일 이전
              </button>
              <button
                onClick={() => askDelete('severity')}
                disabled={deleting || !filterSeverity}
                title={
                  filterSeverity
                    ? `현재 선택된 심각도(${filterSeverity}) 전체 삭제`
                    : '심각도를 먼저 선택하세요'
                }
                className="px-2 py-1 text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                현재 심각도
              </button>
              <button
                onClick={() => askDelete('all')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded transition-colors disabled:opacity-50"
              >
                전체 삭제
              </button>
            </div>
          </div>
        }
      >
        <div className="mb-6">
          <LogFilterBar>
            <LogFilterField label="심각도">
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                className="input"
              >
                <option value="">전체</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </LogFilterField>
            <LogFilterField label="사용자 ID">
              <input
                type="text"
                value={filterUserId}
                onChange={e => setFilterUserId(e.target.value)}
                placeholder="사용자 ID"
                className="input"
              />
            </LogFilterField>
            <LogFilterField label="시작일">
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="input"
              />
            </LogFilterField>
            <LogFilterField label="종료일">
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="input"
              />
            </LogFilterField>
            <button
              type="button"
              onClick={() => {
                setFilterSeverity('');
                setFilterUserId('');
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="btn-secondary btn-sm"
            >
              초기화
            </button>
          </LogFilterBar>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                {[
                  '시간',
                  '사용자',
                  '역할',
                  '메서드',
                  '라우트',
                  '에러 코드',
                  '심각도',
                  '메시지',
                ].map(h => (
                  <th key={h} className="admin-th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    {/* 실패를 '없음' 으로 보여주면 안 된다 — 이 화면은 무슨 일이 있었는지 확인하는 곳이다 */}
                    <ListState>
                      {error
                        ? '불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
                        : '에러 로그가 없습니다.'}
                    </ListState>
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="admin-td text-xs whitespace-nowrap">
                      {formatDateShort(log.createdAt)}
                    </td>
                    <td className="admin-td text-xs">{log.userName || log.userId || '-'}</td>
                    <td className="admin-td text-xs">{log.userRole || '-'}</td>
                    <td className="admin-td text-xs font-mono">{log.method}</td>
                    <td className="admin-td text-xs font-mono max-w-xs truncate" title={log.route}>
                      {log.route}
                    </td>
                    <td className="admin-td text-xs font-mono">{log.errorCode}</td>
                    <td className="admin-td">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityBadge(log.severity)}`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="admin-td text-xs max-w-xs">
                      <div className="truncate" title={log.errorMessage}>
                        {log.errorMessage}
                      </div>
                      {log.requestBody && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-2xs text-primary-600 dark:text-primary-400">
                            패킷 보기
                          </summary>
                          <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-100 p-2 text-2xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            {JSON.stringify(log.requestBody, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              이전
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              다음
            </button>
          </div>
        )}
      </AdminSection>

      <ConfirmationModal
        open={pendingDelete !== null}
        title={`${pendingDelete ? deleteLabels[pendingDelete] : ''}를 삭제할까요?`}
        message="지우면 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={() => (pendingDelete ? handleDelete(pendingDelete) : undefined)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default ErrorLogManagement;
