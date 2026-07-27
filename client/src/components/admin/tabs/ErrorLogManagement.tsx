import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/axios';
import { unwrap } from '../../../api/utils';
import { deleteErrorLogs } from '../../../api/admin';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { toast } from '../../../utils/toast';
import { formatDateShort } from '../../../utils/date';

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

export const ErrorLogManagement = () => {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchLogs = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const res = await api.get('/admin/error-logs', {
          signal,
          params: {
            page,
            limit: 20,
            severity: filterSeverity || undefined,
            userId: filterUserId || undefined,
            dateFrom: filterDateFrom || undefined,
            dateTo: filterDateTo || undefined,
          },
        });
        const data = unwrap(res);
        setLogs(data.logs || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalLogs(data.pagination?.total || 0);
      } catch (err: unknown) {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))
          return;
      } finally {
        setLoading(false);
      }
    },
    [page, filterSeverity, filterUserId, filterDateFrom, filterDateTo]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  /** 에러 로그 삭제 */
  const handleDelete = async (mode: '7d' | '30d' | 'severity' | 'all') => {
    const labels: Record<string, string> = {
      '7d': '7일 이전 에러 로그',
      '30d': '30일 이전 에러 로그',
      severity: filterSeverity ? `심각도 "${filterSeverity}" 에러 로그 전체` : '(심각도 미선택)',
      all: '모든 에러 로그',
    };
    if (mode === 'severity' && !filterSeverity) {
      toast.error('삭제할 심각도를 먼저 선택해주세요.');
      return;
    }
    if (!window.confirm(`${labels[mode]}를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`))
      return;

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
      if (page !== 1) {
        setPage(1); // useEffect가 재실행되어 목록 갱신됨
      } else {
        const ctrl = new AbortController();
        fetchLogs(ctrl.signal);
      }
    } catch {
      toast.error('에러 로그 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && logs.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="에러 로그"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">총 {totalLogs}건</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">삭제:</span>
              <button
                onClick={() => handleDelete('7d')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded transition-colors disabled:opacity-50"
              >
                7일 이전
              </button>
              <button
                onClick={() => handleDelete('30d')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded transition-colors disabled:opacity-50"
              >
                30일 이전
              </button>
              <button
                onClick={() => handleDelete('severity')}
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
                onClick={() => handleDelete('all')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded transition-colors disabled:opacity-50"
              >
                전체 삭제
              </button>
            </div>
          </div>
        }
      >
        {/* Filters */}
        <form
          onSubmit={handleSearch}
          className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex flex-wrap gap-4 items-end mb-6"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              심각도
            </label>
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            >
              <option value="">전체</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              사용자 ID
            </label>
            <input
              type="text"
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
              placeholder="사용자 ID"
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              시작일
            </label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              종료일
            </label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
          >
            검색
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterSeverity('');
              setFilterUserId('');
              setFilterDateFrom('');
              setFilterDateTo('');
              setPage(1);
            }}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm hover:bg-slate-300 dark:hover:bg-slate-500"
          >
            초기화
          </button>
        </form>

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
                  <th
                    key={h}
                    className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    에러 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateShort(log.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">
                      {log.userName || log.userId || '-'}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {log.userRole || '-'}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                      {log.method}
                    </td>
                    <td
                      className="px-3 py-3 text-xs font-mono text-slate-600 dark:text-slate-400 max-w-xs truncate"
                      title={log.route}
                    >
                      {log.route}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                      {log.errorCode}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityBadge(log.severity)}`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td
                      className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-xs truncate"
                      title={log.errorMessage}
                    >
                      {log.errorMessage}
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
    </div>
  );
};

export default ErrorLogManagement;
