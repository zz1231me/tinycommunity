import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fetchLoginHistory } from '../../../api/admin';
import { LoginHistoryRecord } from '../../../types/admin.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { formatDateTime } from '../../../utils/date';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

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

export const LoginHistoryManagement = () => {
  const [records, setRecords] = useState<LoginHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [filterUserId, setFilterUserId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  // 자유 입력 필터는 디바운스 — 키 입력마다 API 호출하지 않도록
  const debouncedUserId = useDebouncedValue(filterUserId, 400);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const fetchRecords = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const params: Record<string, string | number> = { page, limit: 20 };
        if (debouncedUserId) params.userId = debouncedUserId;
        if (filterStatus) params.status = filterStatus;
        if (filterStartDate) params.startDate = filterStartDate;
        if (filterEndDate) params.endDate = filterEndDate;

        const data = await fetchLoginHistory(params, signal);
        setRecords(data.records ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotalRecords(data.total ?? 0);
      } catch {
        // 에러 무시 (취소(CanceledError) 포함 — axios 인터셉터에서 처리)
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, debouncedUserId, filterStatus, filterStartDate, filterEndDate]
  );

  // 언마운트·재요청 시 진행 중 요청을 취소 — 빠른 탭 전환 시 요청 누적/경쟁 방지
  useEffect(() => {
    const controller = new AbortController();
    fetchRecords(controller.signal);
    return () => controller.abort();
  }, [fetchRecords]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // setPage(1)만 — 실제 조회는 useEffect(취소 가능한 signal 경유)가 수행한다.
    // 여기서 fetchRecords()를 직접 부르면 (1)디바운스 이전 값으로 조회되고 (2)취소 불가한
    // 요청이 effect의 signaled 요청과 경쟁하거나 언마운트 후 setState하는 문제가 있었다.
    setPage(1);
  };

  if (loading && records.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="로그인 이력"
        actions={
          <span className="text-sm text-slate-500 dark:text-slate-400">총 {totalRecords}건</span>
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
              상태
            </label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            >
              <option value="">전체</option>
              <option value="success">성공</option>
              <option value="failed">실패</option>
              <option value="locked">잠금</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              시작일
            </label>
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              종료일
            </label>
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
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

        {/* 테이블 */}
        <div className="bg-white dark:bg-slate-800 shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-slate-200 dark:divide-slate-700">
              {/* 칼럼 폭을 헤더와 모든 가상스크롤 행 table에 동일하게 고정해 정렬 일치 */}
              <colgroup>
                <col style={{ width: '170px' }} />
                <col style={{ width: '180px' }} />
                <col />
                <col style={{ width: '110px' }} />
                <col style={{ width: '180px' }} />
              </colgroup>
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[160px]">
                    일시
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    사용자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    IP / User Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    실패 사유
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          <div
            ref={tableScrollRef}
            style={{ height: '500px', overflowY: 'auto', overflowX: 'auto' }}
          >
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const record = records[virtualRow.index];
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
                        <col style={{ width: '180px' }} />
                        <col />
                        <col style={{ width: '110px' }} />
                        <col style={{ width: '180px' }} />
                      </colgroup>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 w-[160px]">
                            {formatDateTime(record.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-200">
                            <div className="flex flex-col">
                              <span className="font-semibold">
                                {record.userName ?? '알 수 없음'}
                              </span>
                              <span className="text-xs text-slate-400">{record.userId}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            <div className="flex flex-col max-w-[200px]">
                              <span className="font-mono text-xs">{record.ipAddress ?? '-'}</span>
                              <span
                                className="text-xs truncate text-slate-400"
                                title={record.userAgent ?? ''}
                              >
                                {record.userAgent ?? '-'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(record.status)}`}
                            >
                              {statusLabel[record.status] ?? record.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {record.failureReason ?? '-'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {records.length === 0 && !loading && (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                  로그인 이력이 없습니다.
                </div>
              )}
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
              {page} / {totalPages}
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

export default LoginHistoryManagement;
