import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKeys } from '../../../api/queryKeys';
import {
  fetchUserLoginHistory,
  fetchUserAuditLogs,
  fetchUserSessions,
  forceLogoutSession,
} from '../../../api/admin';
import {
  LoginHistoryRecord,
  AuditLogRecord,
  UserSessionRecord,
  AuditAction,
} from '../../../types/admin.types';
import { toast } from '../../../utils/toast';
import { formatDateTime, formatRelative } from '../../../utils/date';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ListState } from '../../common/ListState';

type ModalTab = 'login' | 'audit' | 'sessions';

interface Props {
  userId: string;
  userName: string;
  onClose: () => void;
}

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
};

const LOGIN_STATUS_BADGE: Record<string, string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  locked: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

const LOGIN_STATUS_LABEL: Record<string, string> = {
  success: '성공',
  failed: '실패',
  locked: '잠금',
};

export const UserActivityModal: React.FC<Props> = ({ userId, userName, onClose }) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('login');

  const queryClient = useQueryClient();
  const [loginPage, setLoginPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [forcingOut, setForcingOut] = useState<string | null>(null);

  // 각 탭은 실제로 열렸을 때만 조회한다(enabled) — 기존 activeTab 분기 useEffect 와 동일.
  const loginQuery = useQuery({
    queryKey: adminKeys.userActivity.loginHistory(userId, loginPage),
    queryFn: () => fetchUserLoginHistory(userId, { page: loginPage, limit: 15 }),
    enabled: activeTab === 'login',
  });

  const auditQuery = useQuery({
    queryKey: adminKeys.userActivity.auditLogs(userId, auditPage),
    queryFn: () => fetchUserAuditLogs(userId, { page: auditPage, limit: 15 }),
    enabled: activeTab === 'audit',
  });

  const sessionsQuery = useQuery({
    queryKey: adminKeys.userActivity.sessions(userId),
    queryFn: () => fetchUserSessions(userId),
    enabled: activeTab === 'sessions',
  });

  const loginRecords: LoginHistoryRecord[] = loginQuery.data?.records ?? [];
  const loginTotalPages: number = loginQuery.data?.totalPages ?? 1;
  const loginLoading = loginQuery.isPending;

  const auditLogs: AuditLogRecord[] = auditQuery.data?.logs ?? [];
  const auditTotalPages: number = auditQuery.data?.totalPages ?? 1;
  const auditLoading = auditQuery.isPending;

  const sessions: UserSessionRecord[] = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [];
  const sessionsLoading = sessionsQuery.isPending;

  const handleForceLogout = async (sessionId: string) => {
    if (!window.confirm('해당 세션을 강제 종료하시겠습니까?')) return;
    setForcingOut(sessionId);
    try {
      await forceLogoutSession(userId, sessionId);
      toast.success('세션이 강제 종료되었습니다.');
      await queryClient.invalidateQueries({
        queryKey: adminKeys.userActivity.sessions(userId),
      });
    } catch {
      toast.error('세션 종료 중 오류가 발생했습니다.');
    } finally {
      setForcingOut(null);
    }
  };

  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const tabClass = (tab: ModalTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-primary-600 text-white'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`;

  return (
    <div className="fixed inset-0 modal-scrim z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="card-title">활동 내역</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {userName} ({userId})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
          <button className={tabClass('login')} onClick={() => setActiveTab('login')}>
            로그인 이력
          </button>
          <button className={tabClass('audit')} onClick={() => setActiveTab('audit')}>
            관리 작업 이력
          </button>
          <button className={tabClass('sessions')} onClick={() => setActiveTab('sessions')}>
            세션 목록
          </button>
        </div>

        {/* 탭 컨텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ─── 로그인 이력 ─── */}
          {activeTab === 'login' && (
            <div className="space-y-4">
              {loginLoading ? (
                <LoadingSpinner />
              ) : loginRecords.length === 0 ? (
                <ListState>로그인 이력이 없습니다.</ListState>
              ) : (
                <>
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-700">
                      <tr>
                        <th className="admin-th">일시</th>
                        <th className="admin-th">IP</th>
                        <th className="admin-th">상태</th>
                        <th className="admin-th">실패 사유</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {loginRecords.map(record => (
                        <tr
                          key={record.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        >
                          <td className="admin-td whitespace-nowrap">
                            {formatDateTime(record.createdAt)}
                          </td>
                          <td className="admin-td text-xs font-mono whitespace-nowrap">
                            {record.ipAddress ?? '-'}
                          </td>
                          <td className="admin-td whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${LOGIN_STATUS_BADGE[record.status] ?? ''}`}
                            >
                              {LOGIN_STATUS_LABEL[record.status] ?? record.status}
                            </span>
                          </td>
                          <td className="admin-td text-xs">{record.failureReason ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setLoginPage(p => Math.max(1, p - 1))}
                      disabled={loginPage === 1}
                      className="px-3 py-1 rounded border border-slate-200 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
                    >
                      이전
                    </button>
                    <span className="text-sm text-slate-500">
                      {loginPage} / {loginTotalPages}
                    </span>
                    <button
                      onClick={() => setLoginPage(p => Math.min(loginTotalPages, p + 1))}
                      disabled={loginPage === loginTotalPages}
                      className="px-3 py-1 rounded border border-slate-200 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
                    >
                      다음
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── 관리 작업 이력 ─── */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              {auditLoading ? (
                <LoadingSpinner />
              ) : auditLogs.length === 0 ? (
                <ListState>관리 작업 이력이 없습니다.</ListState>
              ) : (
                <>
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-700">
                      <tr>
                        <th className="admin-th">일시</th>
                        <th className="admin-th">관리자</th>
                        <th className="admin-th">작업</th>
                        <th className="admin-th">상세</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {auditLogs.map(log => (
                        <React.Fragment key={log.id}>
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="admin-td whitespace-nowrap">
                              {formatDateTime(log.createdAt)}
                            </td>
                            <td className="admin-td whitespace-nowrap">{log.adminName}</td>
                            <td className="admin-td whitespace-nowrap">
                              <span className="badge badge-info">
                                {ACTION_LABELS[log.action] ?? log.action}
                              </span>
                            </td>
                            <td className="admin-td whitespace-nowrap">
                              {(log.beforeValue ?? log.afterValue) ? (
                                <button
                                  onClick={() =>
                                    setExpandedAuditId(expandedAuditId === log.id ? null : log.id)
                                  }
                                  className="text-primary-600 hover:text-primary-800 dark:text-primary-400 text-xs underline"
                                >
                                  {expandedAuditId === log.id ? '접기' : '상세보기'}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                          {expandedAuditId === log.id && (
                            <tr className="bg-slate-50 dark:bg-slate-900/50">
                              <td colSpan={4} className="admin-td">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 mb-1">
                                      변경 전
                                    </p>
                                    <pre className="text-xs text-slate-600 dark:text-slate-300 font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700 whitespace-pre-wrap">
                                      {log.beforeValue
                                        ? JSON.stringify(log.beforeValue, null, 2)
                                        : '(없음)'}
                                    </pre>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 mb-1">
                                      변경 후
                                    </p>
                                    <pre className="text-xs text-slate-600 dark:text-slate-300 font-mono bg-white dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-slate-700 whitespace-pre-wrap">
                                      {log.afterValue
                                        ? JSON.stringify(log.afterValue, null, 2)
                                        : '(없음)'}
                                    </pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                      disabled={auditPage === 1}
                      className="px-3 py-1 rounded border border-slate-200 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
                    >
                      이전
                    </button>
                    <span className="text-sm text-slate-500">
                      {auditPage} / {auditTotalPages}
                    </span>
                    <button
                      onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                      disabled={auditPage === auditTotalPages}
                      className="px-3 py-1 rounded border border-slate-200 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
                    >
                      다음
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── 세션 목록 ─── */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              {sessionsLoading ? (
                <LoadingSpinner />
              ) : sessions.length === 0 ? (
                <ListState>활성 세션이 없습니다.</ListState>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-700">
                    <tr>
                      <th className="admin-th">시작</th>
                      <th className="admin-th">IP</th>
                      <th className="admin-th">마지막 활동</th>
                      <th className="admin-th">만료</th>
                      <th className="admin-th">액션</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                    {sessions.map(session => (
                      <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="admin-td whitespace-nowrap">
                          {formatDateTime(session.createdAt)}
                        </td>
                        <td className="admin-td text-xs font-mono whitespace-nowrap">
                          {session.ipAddress ?? '-'}
                        </td>
                        <td className="admin-td whitespace-nowrap">
                          {formatRelative(session.lastActiveAt)}
                        </td>
                        <td className="admin-td whitespace-nowrap">
                          {formatDateTime(session.expiresAt)}
                        </td>
                        <td className="admin-td whitespace-nowrap">
                          <button
                            onClick={() => handleForceLogout(session.id)}
                            disabled={forcingOut === session.id}
                            className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded transition-colors disabled:opacity-50"
                          >
                            {forcingOut === session.id ? '처리 중...' : '강제 종료'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
