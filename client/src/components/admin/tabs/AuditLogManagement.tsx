import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { fetchAuditLogs } from '../../../api/admin';
import { AuditLogRecord, AuditAction } from '../../../types/admin.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { formatDateTime } from '../../../utils/date';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

const ACTION_LABELS: Record<AuditAction, string> = {
  create_user: '사용자 생성',
  update_user: '사용자 수정',
  delete_user: '사용자 삭제',
  restore_user: '사용자 복구',
  approve_user: '회원 승인',
  reject_user: '회원 거부',
  deactivate_user: '계정 비활성화',
  reset_password: '비밀번호 초기화',
  approve_password_reset: '초기화 요청 승인',
  reject_password_reset: '초기화 요청 거절',
  change_role: '역할 변경',
  create_board: '게시판 생성',
  update_board: '게시판 수정',
  delete_board: '게시판 삭제',
  create_role: '역할 생성',
  update_role: '역할 수정',
  delete_role: '역할 삭제',
  update_permission: '권한 설정',
  delete_event: '이벤트 삭제',
  update_event: '이벤트 수정',
  update_site_settings: '사이트 설정',
  force_logout: '강제 로그아웃',
  delete_security_log: '보안 로그 삭제',
  delete_error_log: '에러 로그 삭제',
  create_ip_rule: 'IP 규칙 생성',
  update_ip_rule: 'IP 규칙 수정',
  delete_ip_rule: 'IP 규칙 삭제',
};

const ACTION_COLORS: Record<string, string> = {
  create_user: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  update_user: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  delete_user: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  restore_user: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  approve_user: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  reject_user: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  deactivate_user: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  reset_password: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  approve_password_reset:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  reject_password_reset: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  change_role: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  create_board: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  update_board: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  delete_board: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  create_role: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  update_role: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  delete_role: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  update_permission: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  delete_event: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  update_event: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  update_site_settings: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  force_logout: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  delete_security_log: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  delete_error_log: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  create_ip_rule: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  update_ip_rule: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  delete_ip_rule: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const AuditLogManagement = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filterAdminId, setFilterAdminId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterTargetType, setFilterTargetType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  // 자유 입력 필터는 디바운스 — 키 입력마다 API 호출하지 않도록
  const debouncedAdminId = useDebouncedValue(filterAdminId, 400);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 60,
    overscan: 10,
  });

  const fetchLogs = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const params: Record<string, string | number> = { page, limit: 20 };
        if (debouncedAdminId) params.adminId = debouncedAdminId;
        if (filterAction) params.action = filterAction;
        if (filterTargetType) params.targetType = filterTargetType;
        if (filterStartDate) params.startDate = filterStartDate;
        if (filterEndDate) params.endDate = filterEndDate;

        const data = await fetchAuditLogs(params, signal);
        setLogs(data.logs ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotalLogs(data.total ?? 0);
      } catch {
        // 에러 무시 (취소(CanceledError) 포함)
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, debouncedAdminId, filterAction, filterTargetType, filterStartDate, filterEndDate]
  );

  // 언마운트·재요청 시 진행 중 요청 취소 — 빠른 탭 전환 시 요청 누적/경쟁 방지
  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // setPage(1)만 — 실제 조회는 useEffect(취소 가능한 signal 경유)가 수행한다.
    // 직접 fetchLogs()를 부르면 디바운스 이전 값 조회 + 취소 불가 요청 경쟁/언마운트 setState 문제.
    setPage(1);
  };

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

  if (loading && logs.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <AdminSection
        title="감사 로그 (관리자 작업 이력)"
        actions={
          <span className="text-sm text-slate-500 dark:text-slate-400">총 {totalLogs}건</span>
        }
      >
        {/* 필터 */}
        <form
          onSubmit={handleSearch}
          className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg flex flex-wrap gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              관리자 ID
            </label>
            <input
              type="text"
              value={filterAdminId}
              onChange={e => setFilterAdminId(e.target.value)}
              placeholder="Admin ID"
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              작업 유형
            </label>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            >
              <option value="">전체</option>
              {(Object.entries(ACTION_LABELS) as [AuditAction, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              대상 유형
            </label>
            <select
              value={filterTargetType}
              onChange={e => setFilterTargetType(e.target.value)}
              className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm"
            >
              <option value="">전체</option>
              <option value="user">사용자</option>
              <option value="board">게시판</option>
              <option value="role">역할</option>
              <option value="event">이벤트</option>
              <option value="setting">설정</option>
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
                <col style={{ width: '160px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '180px' }} />
                <col />
              </colgroup>
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider w-[160px]">
                    일시
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    관리자
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    작업
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    대상
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                    변경 내역
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
                const log = logs[virtualRow.index];
                const isExpanded = expandedId === log.id;
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
                        <col style={{ width: '160px' }} />
                        <col style={{ width: '170px' }} />
                        <col style={{ width: '180px' }} />
                        <col />
                      </colgroup>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 w-[160px]">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-200">
                            <div className="flex flex-col">
                              <span className="font-semibold">{log.adminName}</span>
                              <span className="text-xs text-slate-400">{log.adminId}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-800'}`}
                            >
                              {ACTION_LABELS[log.action] ?? log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-slate-400">
                                {log.targetType}
                              </span>
                              <span>{log.targetName ?? log.targetId ?? '-'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {(log.beforeValue ?? log.afterValue) ? (
                              <button
                                onClick={() => toggleExpand(log.id)}
                                className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 text-xs underline"
                              >
                                {isExpanded ? '접기' : '상세보기'}
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50 dark:bg-slate-900/50">
                            <td colSpan={5} className="px-6 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                    변경 전
                                  </p>
                                  <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700">
                                    {log.beforeValue
                                      ? JSON.stringify(log.beforeValue, null, 2)
                                      : '(없음)'}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                                    변경 후
                                  </p>
                                  <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700">
                                    {log.afterValue
                                      ? JSON.stringify(log.afterValue, null, 2)
                                      : '(없음)'}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {logs.length === 0 && !loading && (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                  감사 로그가 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 0 && (
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
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border border-slate-300 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
              >
                다음
              </button>
            </div>
          )}
        </div>
      </AdminSection>
    </div>
  );
};

export default AuditLogManagement;
