import { useState } from 'react';
import { fetchAuditLogs } from '../../../api/admin';
import { AuditLogRecord, AuditAction } from '../../../types/admin.types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { LogFilterBar, LogFilterField } from '../common/LogFilterBar';
import { VirtualLogTable, LogColumn } from '../common/VirtualLogTable';
import { formatDateTime } from '../../../utils/date';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useAdminLogQuery } from '../../../hooks/admin/useAdminLogQuery';

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
  update_attendance_settings: '출퇴근 설정',
  delete_post: '게시글 삭제',
  delete_comment: '댓글 삭제',
  delete_wiki_page: '위키 삭제',
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
  update_attendance_settings: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
};

const COLUMNS: LogColumn[] = [
  { label: '일시', width: '170px' },
  { label: '관리자', width: '160px' },
  { label: '작업', width: '170px' },
  { label: '대상', width: '180px' },
  { label: '변경 내역' },
];

export const AuditLogManagement = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filterActorId, setFilterActorId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterTargetType, setFilterTargetType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  // 자유 입력 필터는 디바운스 — 키 입력마다 API 호출하지 않도록
  const debouncedActorId = useDebouncedValue(filterActorId, 400);

  const {
    records: logs,
    total: totalLogs,
    totalPages,
    loading,
    error,
    page,
    goPrev,
    goNext,
  } = useAdminLogQuery<AuditLogRecord>({
    kind: 'audit',
    filters: {
      actorId: debouncedActorId,
      action: filterAction,
      targetType: filterTargetType,
      startDate: filterStartDate,
      endDate: filterEndDate,
    },
    fetcher: async (params, signal) => {
      const data = await fetchAuditLogs(params, signal);
      return { items: data.logs ?? [], total: data.total ?? 0, totalPages: data.totalPages ?? 1 };
    },
  });

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
        <LogFilterBar>
          <LogFilterField label="관리자 ID">
            <input
              type="text"
              value={filterActorId}
              onChange={e => setFilterActorId(e.target.value)}
              placeholder="Admin ID"
              className="input"
            />
          </LogFilterField>
          <LogFilterField label="작업 유형">
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="input"
            >
              <option value="">전체</option>
              {(Object.entries(ACTION_LABELS) as [AuditAction, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </LogFilterField>
          <LogFilterField label="대상 유형">
            <select
              value={filterTargetType}
              onChange={e => setFilterTargetType(e.target.value)}
              className="input"
            >
              <option value="">전체</option>
              <option value="user">사용자</option>
              <option value="board">게시판</option>
              <option value="role">역할</option>
              <option value="event">이벤트</option>
              <option value="setting">설정</option>
              <option value="attendance">출퇴근</option>
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
          rows={logs}
          loading={loading}
          emptyMessage="감사 로그가 없습니다."
          error={error}
          page={page}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
          estimateRowHeight={60}
          dynamicRowHeight
          renderRow={log => (
            <>
              <td className="admin-td whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
              <td className="admin-td whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="font-semibold">{log.actorName}</span>
                  <span className="text-xs text-slate-400">{log.actorId}</span>
                </div>
              </td>
              <td className="admin-td whitespace-nowrap">
                <span
                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'}`}
                >
                  {ACTION_LABELS[log.action] ?? log.action}
                </span>
              </td>
              <td className="admin-td whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-slate-400">{log.targetType}</span>
                  <span>{log.targetName ?? log.targetId ?? '-'}</span>
                </div>
              </td>
              <td className="admin-td whitespace-nowrap">
                {(log.beforeValue ?? log.afterValue) ? (
                  <button
                    onClick={() => toggleExpand(log.id)}
                    className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 text-xs underline"
                  >
                    {expandedId === log.id ? '접기' : '상세보기'}
                  </button>
                ) : (
                  <span className="text-slate-400 text-xs">-</span>
                )}
              </td>
            </>
          )}
          renderExpandedRow={log =>
            expandedId === log.id ? (
              <tr className="bg-slate-50 dark:bg-slate-900/50">
                <td colSpan={5} className="admin-td">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        변경 전
                      </p>
                      <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700">
                        {log.beforeValue ? JSON.stringify(log.beforeValue, null, 2) : '(없음)'}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        변경 후
                      </p>
                      <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700">
                        {log.afterValue ? JSON.stringify(log.afterValue, null, 2) : '(없음)'}
                      </pre>
                    </div>
                  </div>
                </td>
              </tr>
            ) : null
          }
        />
      </AdminSection>
    </div>
  );
};

export default AuditLogManagement;
