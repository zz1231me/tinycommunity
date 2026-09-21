import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { adminKeys } from '../../../api/queryKeys';
import {
  fetchUserLoginHistory,
  fetchUserAuditLogs,
  fetchUserSessions,
  forceLogoutSession,
  fetchErrorLogs,
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
import { ConfirmationModal } from '../common/ConfirmationModal';

type ModalTab = 'login' | 'audit' | 'sessions' | 'denied';

/** 거부당한 시도 한 줄. 에러 로그에서 이 사용자 것만 골라 온다. */
type DeniedAttempt = {
  id: string;
  createdAt: string;
  method: string;
  route: string;
  errorCode: string;
  severity: string;
  errorMessage: string;
  requestBody?: { ip?: string } | null;
};

const SEVERITY_BADGE: Record<string, string> = {
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  critical: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

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
  delete_post: '게시글 삭제',
  delete_comment: '댓글 삭제',
  delete_wiki_page: '위키 삭제',
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
  const [deniedPage, setDeniedPage] = useState(1);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [forcingOut, setForcingOut] = useState<string | null>(null);
  // 브라우저 기본 confirm 은 창 위에 떠 이 대화상자와 따로 논다 — 공용 확인 상자를 쓴다
  const [pendingLogout, setPendingLogout] = useState<string | null>(null);

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

  // 거부당한 시도 — 에러 로그를 이 사용자로 걸러서 본다.
  // 서버가 이미 userId 필터를 받으므로 전용 엔드포인트를 따로 두지 않는다.
  const deniedQuery = useQuery({
    queryKey: adminKeys.userActivity.deniedAttempts(userId, deniedPage),
    queryFn: () => fetchErrorLogs({ userId, page: deniedPage, limit: 15 }),
    enabled: activeTab === 'denied',
  });

  const loginRecords: LoginHistoryRecord[] = loginQuery.data?.records ?? [];
  const loginTotalPages: number = loginQuery.data?.totalPages ?? 1;
  const loginLoading = loginQuery.isPending;

  const auditLogs: AuditLogRecord[] = auditQuery.data?.logs ?? [];
  const auditTotalPages: number = auditQuery.data?.totalPages ?? 1;
  const auditLoading = auditQuery.isPending;

  const sessions: UserSessionRecord[] = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : [];
  const sessionsLoading = sessionsQuery.isPending;

  const deniedAttempts: DeniedAttempt[] = deniedQuery.data?.logs ?? [];
  const deniedTotalPages: number = deniedQuery.data?.pagination?.totalPages ?? 1;
  const deniedLoading = deniedQuery.isPending;

  // 조회 실패를 '없음' 으로 보여주면 안 된다. 여기는 누가 무엇을 했는지 확인하는
  // 화면이라, 못 불러온 것과 기록이 깨끗한 것이 같아 보이면 판단을 그르친다.
  const FETCH_FAILED = '불러오지 못했습니다. 잠시 후 다시 시도해주세요.';

  const handleForceLogout = async (sessionId: string) => {
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
      setPendingLogout(null);
    }
  };

  // ESC 로 닫고, 열려 있는 동안 포커스를 안에 가둔다. 이 대화상자는 부모가 열 때만
  // 그리므로(UserManagement 의 {activityModal && ...}) 항상 켜 둔다.
  // 가두지 않으면 Tab 이 뒤쪽 사용자 목록으로 새어, 가려진 줄의 단추를 누르게 된다.
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  const tabClass = (tab: ModalTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-primary-600 text-white'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`;

  return (
    <div className="fixed inset-0 modal-scrim z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="활동 내역"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
      >
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
            aria-label="닫기"
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
          <button className={tabClass('denied')} onClick={() => setActiveTab('denied')}>
            거부된 시도
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
                <ListState>
                  {loginQuery.isError ? FETCH_FAILED : '로그인 이력이 없습니다.'}
                </ListState>
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
                <ListState>
                  {auditQuery.isError ? FETCH_FAILED : '관리 작업 이력이 없습니다.'}
                </ListState>
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
                            <td className="admin-td whitespace-nowrap">{log.actorName}</td>
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

          {/* ─── 거부된 시도 ─── */}
          {activeTab === 'denied' && (
            <div className="space-y-4">
              {deniedLoading ? (
                <LoadingSpinner />
              ) : deniedAttempts.length === 0 ? (
                <ListState>
                  {deniedQuery.isError ? FETCH_FAILED : '거부된 시도가 없습니다.'}
                </ListState>
              ) : (
                <>
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-700">
                      <tr>
                        <th className="admin-th">일시</th>
                        <th className="admin-th">등급</th>
                        <th className="admin-th">요청</th>
                        <th className="admin-th">IP</th>
                        <th className="admin-th">사유</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {deniedAttempts.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="admin-td whitespace-nowrap">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="admin-td whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                SEVERITY_BADGE[row.severity] ?? SEVERITY_BADGE.info
                              }`}
                            >
                              {row.errorCode}
                            </span>
                          </td>
                          <td className="admin-td font-mono text-xs">
                            {row.method} {row.route}
                          </td>
                          <td className="admin-td whitespace-nowrap font-mono text-xs">
                            {row.requestBody?.ip ?? '-'}
                          </td>
                          <td className="admin-td text-xs">{row.errorMessage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setDeniedPage(p => Math.max(1, p - 1))}
                      disabled={deniedPage === 1}
                      className="px-3 py-1 rounded border border-slate-200 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
                    >
                      이전
                    </button>
                    <span className="text-sm text-slate-500">
                      {deniedPage} / {deniedTotalPages}
                    </span>
                    <button
                      onClick={() => setDeniedPage(p => Math.min(deniedTotalPages, p + 1))}
                      disabled={deniedPage === deniedTotalPages}
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
                <ListState>
                  {sessionsQuery.isError ? FETCH_FAILED : '활성 세션이 없습니다.'}
                </ListState>
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
                            onClick={() => setPendingLogout(session.id)}
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

      <ConfirmationModal
        open={pendingLogout !== null}
        title="이 세션을 강제 종료할까요?"
        message="해당 기기에서 즉시 로그아웃됩니다."
        confirmLabel="강제 종료"
        onConfirm={() => (pendingLogout ? handleForceLogout(pendingLogout) : undefined)}
        onCancel={() => setPendingLogout(null)}
      />
    </div>
  );
};
