import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import api from '../../../api/axios';
import { unwrap } from '../../../api/utils';
import { deleteSecurityLogs } from '../../../api/admin';
import { toast } from '../../../utils/toast';
import { SecurityLog } from '../../../types/admin.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { formatDateTime } from '../../../utils/date';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

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

export const SecurityLogManagement = () => {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  // Filters
  const [filterUserId, setFilterUserId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterIp, setFilterIp] = useState('');
  // 자유 입력 필터는 디바운스 — 키 입력마다 API 호출하지 않도록
  const debouncedUserId = useDebouncedValue(filterUserId, 400);
  const debouncedIp = useDebouncedValue(filterIp, 400);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Virtual scroll for log rows
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const fetchLogs = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const res = await api.get('/admin/security-logs', {
          params: {
            page,
            limit: 20,
            userId: debouncedUserId || undefined,
            action: filterAction || undefined,
            ipAddress: debouncedIp || undefined,
          },
          signal,
        });
        const data = unwrap(res);
        setLogs(data.logs ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotalLogs(data.total ?? 0);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'CanceledError' || error.name === 'AbortError')
        )
          return;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, debouncedUserId, filterAction, debouncedIp]
  );

  // 언마운트·재요청 시 진행 중 요청 취소 — 빠른 탭 전환 시 요청 누적/경쟁 방지
  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // setPage(1)만 — 실제 조회는 디바운스된 값으로 useEffect가 수행한다.
    // 여기서 fetchLogs()를 직접 부르면 디바운스 반영 전(직전) 값으로 조회되는 버그가 있었다.
    setPage(1); // Reset to first page on search
  };

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/admin/export/security-logs', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
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
      fetchLogs();
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleExport()}
              disabled={exporting}
              className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? '내보내는 중...' : 'Excel 내보내기'}
            </button>
            <span className="text-sm text-slate-500">총 {totalLogs}건</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">삭제:</span>
              <button
                onClick={() => handleDelete('30d')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded transition-colors disabled:opacity-50"
              >
                30일 이전
              </button>
              <button
                onClick={() => handleDelete('90d')}
                disabled={deleting}
                className="px-2 py-1 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded transition-colors disabled:opacity-50"
              >
                90일 이전
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
        {/* 필터 */}
        <form
          onSubmit={handleSearch}
          className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex flex-wrap gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              사용자 ID
            </label>
            <input
              type="text"
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
              placeholder="User ID"
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Action
            </label>
            <input
              type="text"
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              placeholder="LOGIN_SUCCESS, etc."
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              IP Address
            </label>
            <input
              type="text"
              value={filterIp}
              onChange={e => setFilterIp(e.target.value)}
              placeholder="127.0.0.1"
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded text-sm font-medium transition-colors"
          >
            검색
          </button>
        </form>

        {/* 로그 테이블 */}
        <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden">
          {/* Table header (fixed, not virtualized) */}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-slate-200 dark:divide-slate-700">
              {/* 칼럼 폭을 헤더와 모든 가상스크롤 행 table에 동일하게 고정해 정렬 일치 */}
              <colgroup>
                <col style={{ width: '170px' }} />
                <col />
                <col style={{ width: '170px' }} />
                <col style={{ width: '210px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '96px' }} />
              </colgroup>
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    IP / Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          {/* Virtualized table body */}
          <div
            ref={tableScrollRef}
            style={{ height: '500px', overflowY: 'auto', overflowX: 'auto' }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const log = logs[virtualRow.index];
                const isExpanded = expandedLogId === log.id;
                return (
                  <div
                    key={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col style={{ width: '170px' }} />
                        <col />
                        <col style={{ width: '170px' }} />
                        <col style={{ width: '210px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '96px' }} />
                      </colgroup>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 w-[160px]">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                            <div className="flex flex-col">
                              <span>{log.action}</span>
                              <span className="text-xs text-slate-400 font-mono">
                                {log.method} {log.route}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">
                            {log.user ? (
                              <div className="flex flex-col">
                                <span className="font-semibold">{log.user.name}</span>
                                <span className="text-xs text-slate-400">{log.userId}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Guest / System</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            <div className="flex flex-col max-w-[150px]">
                              <span className="font-mono">{log.ipAddress}</span>
                              <span className="text-xs truncate" title={log.userAgent}>
                                {log.userAgent}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(log.status)}`}
                            >
                              {log.status === 'WARNING' ? '3XX (REDIR)' : log.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            <button
                              onClick={() => toggleExpand(log.id)}
                              className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 text-xs underline"
                            >
                              {isExpanded ? '접기' : '상세보기'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50 dark:bg-slate-900/50">
                            <td colSpan={6} className="px-6 py-4">
                              <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700">
                                {log.details
                                  ? JSON.stringify(log.details, null, 2)
                                  : 'No details available'}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 페이지네이션 */}
          <div className="px-6 py-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
            >
              이전
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
            >
              다음
            </button>
          </div>
        </div>
      </AdminSection>
    </div>
  );
};

export default SecurityLogManagement;
