// client/src/pages/Profile.tsx - 탭 기반 재구성
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LoadingSpinner } from '../components/common/LoadingStates';
import { PageContainer } from '../components/common/PageContainer';
import { scrollContentToTop } from '../utils/scroll';
import {
  User,
  Bell,
  FileText,
  MessageCircle,
  ShieldCheck,
  Settings,
  Check,
  X,
  LogOut,
  Monitor,
  Gift,
} from 'lucide-react';
import { NotificationSettings } from '../components/social/NotificationSettings';
import { LotteryPanel } from '../components/points/LotteryPanel';
import { useFeature, type FeatureKey } from '../store/features';
import { useAuth } from '../store/auth';
import { useSiteSettings } from '../store/siteSettings';
import { AvatarUpload } from '../components/AvatarUpload';
import { TwoFactorSettings } from '../components/TwoFactorSettings';
import {
  changePassword,
  updateProfile,
  fetchMySessions,
  terminateMySession,
  type MySession,
} from '../api/auth';
import { getSecurityLogs } from '../api/users';
import { toast } from '../utils/toast';
import { getRoleBadgeClass, getRoleName } from '../utils/roleUtils';
import { formatDate, formatDateTime, formatRelative } from '../utils/date';
import { PageHeader } from '../components/common/PageHeader';
import { PostsTab } from './profile/PostsTab';
import { CommentsTab } from './profile/CommentsTab';
import { EmptyState, LoadingRows, Pagination, RetryState } from './profile/parts';

// user-agent를 간단한 기기 라벨로 요약
const deviceLabel = (ua: string | null): string => {
  if (!ua) return '알 수 없는 기기';
  const browser = /Edg/.test(ua)
    ? 'Edge'
    : /Chrome/.test(ua)
      ? 'Chrome'
      : /Firefox/.test(ua)
        ? 'Firefox'
        : /Safari/.test(ua)
          ? 'Safari'
          : '브라우저';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS|Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
};

// ─── 탭 정의 ────────────────────────────────────────────────────────────────
type TabId =
  'profile' | 'posts' | 'comments' | 'points' | 'notifications' | 'security' | 'settings';
/** 기능 스위치로 켜질 때만 보이는 탭 */
const FEATURE_TABS: Partial<Record<TabId, FeatureKey>> = { points: 'tools.lottery' };

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: '프로필', icon: <User className="w-4 h-4" /> },
  { id: 'posts', label: '내 게시글', icon: <FileText className="w-4 h-4" /> },
  { id: 'comments', label: '내 댓글', icon: <MessageCircle className="w-4 h-4" /> },
  { id: 'points', label: '포인트', icon: <Gift className="w-4 h-4" /> },
  { id: 'notifications', label: '알림', icon: <Bell className="w-4 h-4" /> },
  { id: 'security', label: '접속기록', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'settings', label: '계정설정', icon: <Settings className="w-4 h-4" /> },
];

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

interface SecurityLog {
  id: string;
  action: string;
  ipAddress?: string;
  createdAt: string;
}

// ─── 서브 컴포넌트 ───────────────────────────────────────────────────────────

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate();
  const { getUser, updateUser, clearUser } = useAuth();
  const user = getUser();
  const { settings } = useSiteSettings();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const lotteryEnabled = useFeature('tools.lottery');
  // 꺼진 기능의 탭은 아예 보여주지 않는다 (서버도 requireFeature 로 막는다)
  const visibleTabs = TABS.filter(t => {
    const key = FEATURE_TABS[t.id];
    return !key || (key === 'tools.lottery' ? lotteryEnabled : true);
  });

  // 내 게시글

  // 내 댓글

  // 접속 기록
  const [securityLogs, setSecurityLogs] = useState<SecurityLog[]>([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityLoaded, setSecurityLoaded] = useState(false);
  const [securityError, setSecurityError] = useState(false);
  const [securityPage, setSecurityPage] = useState(1);
  const [securityTotalPages, setSecurityTotalPages] = useState(1);

  // 활성 세션
  const [sessions, setSessions] = useState<MySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);

  // 이름 변경
  const [nameInput, setNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isChangingName, setIsChangingName] = useState(false);

  // 비밀번호 변경
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // ─── 데이터 로드 ─────────────────────────────────────────────────────────

  const loadSecurity = useCallback(async (page = 1) => {
    setSecurityLoading(true);
    setSecurityError(false);
    try {
      const data = await getSecurityLogs(page, 20);
      setSecurityLogs((data.logs as SecurityLog[]) ?? []);
      setSecurityTotalPages(data.pagination?.totalPages ?? 1);
      setSecurityPage(page);
      setSecurityLoaded(true);
    } catch {
      setSecurityError(true);
      toast.error('접속 기록을 불러오지 못했습니다.');
    } finally {
      setSecurityLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      setSessions(await fetchMySessions());
      setSessionsLoaded(true);
    } catch {
      toast.error('세션 목록을 불러오지 못했습니다.');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const handleTerminateSession = async (id: string) => {
    setTerminatingId(id);
    try {
      await terminateMySession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast.success('세션을 종료했습니다.');
    } catch {
      toast.error('세션 종료에 실패했습니다.');
    } finally {
      setTerminatingId(null);
    }
  };

  // 글·댓글 탭은 각자 useQuery 로 스스로 불러온다(캐시가 남아 재진입 시 다시 부르지 않는다).
  // 접속 기록·세션은 아직 여기서 직접 관리한다 — loaded 플래그는 실패 시 재시도를 위한 것이다.
  useEffect(() => {
    if (activeTab === 'security' && !securityLoaded) loadSecurity(1);
    if (activeTab === 'security' && !sessionsLoaded) loadSessions();
  }, [activeTab, securityLoaded, sessionsLoaded, loadSecurity, loadSessions]);

  // 탭 전환 시 상단으로 스크롤 (긴 탭→짧은 탭 전환 시 빈 화면 노출 방지)
  useEffect(() => {
    scrollContentToTop();
  }, [activeTab]);

  // ─── 이름 변경 ───────────────────────────────────────────────────────────
  const handleNameEdit = () => {
    setNameInput(user?.name ?? '');
    setIsEditingName(true);
  };

  const handleNameCancel = () => {
    setIsEditingName(false);
    setNameInput('');
  };

  const handleNameSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error('이름을 입력해주세요.');
      return;
    }
    if (trimmed.length > 50) {
      toast.error('이름은 50자 이내여야 합니다.');
      return;
    }
    setIsChangingName(true);
    try {
      await updateProfile(trimmed);
      updateUser({ name: trimmed });
      toast.success('이름이 변경되었습니다.');
      setIsEditingName(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.message ?? '이름 변경 중 오류가 발생했습니다.');
    } finally {
      setIsChangingName(false);
    }
  };

  // ─── 비밀번호 변경 ────────────────────────────────────────────────────────
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('모든 필드를 입력해주세요.');
      return;
    }
    if (newPassword.length < settings.minPasswordLength) {
      toast.error(`새 비밀번호는 ${settings.minPasswordLength}자 이상이어야 합니다.`);
      return;
    }
    // 복잡도 검증 (관리자 설정 기반)
    if (settings.requireUppercase && !/[A-Z]/.test(newPassword)) {
      toast.error('비밀번호는 영문 대문자를 포함해야 합니다.');
      return;
    }
    if (settings.requireLowercase && !/[a-z]/.test(newPassword)) {
      toast.error('비밀번호는 영문 소문자를 포함해야 합니다.');
      return;
    }
    if (settings.requireNumberOrSpecial && !/[0-9!@#$%^&*]/.test(newPassword)) {
      toast.error('비밀번호는 숫자 또는 특수문자(!@#$%^&*)를 포함해야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      // 서버가 비번 변경 시 tokenVersion 증가 + 전 세션 만료 → 현재 토큰도 무효화된다.
      // 그대로 두면 다음 요청에서 401로 갑자기 로그인 화면으로 튕기므로, 명시적으로 로그아웃 안내 후 이동.
      toast.success('비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해주세요.');
      clearUser();
      navigate('/');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.message ?? '비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="프로필을 불러오는 중..." />
      </div>
    );
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <PageContainer width="reading">
        {/* 다른 화면과 같은 머리글을 쓴다. 예전에는 여기만 손으로 그려서 제목이
            text-2xl font-bold — 나머지 페이지(text-xl font-semibold)보다 한 단계 컸고,
            뒤로 가기도 이 화면에만 있는 버튼이었다. 되돌아갈 곳은 breadcrumb 이 알려 준다. */}
        <PageHeader
          breadcrumbs={[{ label: '대시보드', to: '/dashboard' }, { label: '마이페이지' }]}
          title="마이페이지"
          description={`${user.name}님의 개인 공간`}
          icon={<User className="h-6 w-6" />}
        />

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-1 mb-6 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── 탭 컨텐츠 ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {/* 1. 프로필 탭 */}
            {activeTab === 'profile' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
                {/* 아바타 */}
                <div className="card p-6 text-center">
                  <AvatarUpload
                    user={user}
                    onAvatarUpdate={url => updateUser({ avatar: url })}
                    size="xl"
                    showName={false}
                    allowDelete={true}
                  />
                  <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {user.name}
                  </h2>
                  <span
                    className={`inline-flex mt-2 px-3 py-1 rounded-full text-xs font-bold ${getRoleBadgeClass(user.role)}`}
                  >
                    {getRoleName(user.role)}
                  </span>
                </div>

                {/* 기본 정보 */}
                <div className="card sm:col-span-2 p-6 space-y-5">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                    기본 정보
                  </h3>
                  <InfoRow label="사용자 ID" value={user.id} note="변경 불가" />

                  {/* 이름 변경 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:w-28 flex-shrink-0">
                      이름
                    </span>
                    <div className="flex-1">
                      {isEditingName ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nameInput}
                            onChange={e => setNameInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === 'Enter') handleNameSave();
                              if (e.key === 'Escape') handleNameCancel();
                            }}
                            maxLength={50}
                            autoFocus
                            className="input input-sm flex-1 max-w-[200px]"
                          />
                          <button
                            onClick={handleNameSave}
                            disabled={isChangingName}
                            className="btn-primary btn-sm"
                          >
                            {isChangingName ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={handleNameCancel}
                            disabled={isChangingName}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                            {user.name}
                          </span>
                          <button
                            onClick={handleNameEdit}
                            className="px-3 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                          >
                            변경
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <InfoRow
                    label="계정 생성일"
                    value={user.createdAt ? formatDate(user.createdAt) : '정보 없음'}
                  />
                  {user.permissions?.events && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                        이벤트 권한
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {['canRead', 'canCreate', 'canUpdate', 'canDelete'].map(k => (
                          <PermBadge
                            key={k}
                            label={
                              {
                                canRead: '읽기',
                                canCreate: '생성',
                                canUpdate: '수정',
                                canDelete: '삭제',
                              }[k] ?? k
                            }
                            granted={!!(user.permissions.events as Record<string, unknown>)[k]}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'posts' && <PostsTab />}

            {activeTab === 'comments' && <CommentsTab />}

            {activeTab === 'security' && (
              <div className="card mb-6 overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-700">
                  <h3 className="card-title">활성 세션</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    현재 로그인된 기기 목록 · 다른 기기는 종료할 수 있습니다
                  </p>
                </div>
                {sessionsLoading ? (
                  <LoadingRows />
                ) : sessions.length === 0 ? (
                  <EmptyState icon={<Monitor className="w-6 h-6" />} text="활성 세션이 없습니다." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                          <th className="px-5 py-3 font-medium">기기</th>
                          <th className="px-5 py-3 font-medium">IP 주소</th>
                          <th className="px-5 py-3 font-medium">최근 활동</th>
                          <th className="px-5 py-3 font-medium text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {sessions.map(s => (
                          <tr
                            key={s.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <Monitor className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                <span
                                  className="text-slate-700 dark:text-slate-200 truncate max-w-[180px]"
                                  title={s.userAgent ?? ''}
                                >
                                  {deviceLabel(s.userAgent)}
                                </span>
                                {s.isCurrent && (
                                  <span className="badge badge-primary">현재 기기</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                              {s.ipAddress ?? '-'}
                            </td>
                            <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                              {formatRelative(s.lastActiveAt)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {s.isCurrent ? (
                                <span className="text-xs text-slate-400">—</span>
                              ) : (
                                <button
                                  onClick={() => handleTerminateSession(s.id)}
                                  disabled={terminatingId === s.id}
                                  className="px-3 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                >
                                  {terminatingId === s.id ? '종료 중...' : '종료'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'security' && (
              <div className="card overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-700">
                  <h3 className="card-title">접속 기록</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    로그인 성공/실패, 로그아웃 이력
                  </p>
                </div>
                {securityLoading ? (
                  <LoadingRows />
                ) : securityError ? (
                  <RetryState onRetry={() => loadSecurity(securityPage)} />
                ) : securityLogs.length === 0 ? (
                  <EmptyState
                    icon={<ShieldCheck className="w-6 h-6" />}
                    text="접속 기록이 없습니다."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                          <th className="px-5 py-3 font-medium">유형</th>
                          <th className="px-5 py-3 font-medium">IP 주소</th>
                          <th className="px-5 py-3 font-medium">시각</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {securityLogs.map(log => (
                          <tr
                            key={log.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                          >
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                                  log.action === 'LOGIN_SUCCESS'
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                    : log.action === 'LOGIN_FAILED'
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {log.action === 'LOGIN_SUCCESS' ? (
                                  <>
                                    <Check className="w-3 h-3" strokeWidth={2.5} />
                                    로그인 성공
                                  </>
                                ) : log.action === 'LOGIN_FAILED' ? (
                                  <>
                                    <X className="w-3 h-3" strokeWidth={2.5} />
                                    로그인 실패
                                  </>
                                ) : (
                                  <>
                                    <LogOut className="w-3 h-3" />
                                    로그아웃
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                              {log.ipAddress ?? '-'}
                            </td>
                            <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">
                              {formatDateTime(log.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {securityTotalPages > 1 && (
                  <Pagination
                    page={securityPage}
                    totalPages={securityTotalPages}
                    onChange={p => loadSecurity(p)}
                  />
                )}
              </div>
            )}

            {/* 5. 계정설정 탭 */}
            {activeTab === 'points' && lotteryEnabled && <LotteryPanel />}
            {activeTab === 'notifications' && <NotificationSettings />}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* 비밀번호 변경 */}
                <div className="card p-6">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-5">
                    비밀번호 변경
                  </h3>
                  <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
                    {[
                      {
                        key: 'currentPassword',
                        label: '현재 비밀번호',
                        autocomplete: 'current-password',
                      },
                      {
                        key: 'newPassword',
                        label: '새 비밀번호',
                        note: `${settings.minPasswordLength}자 이상`,
                        autocomplete: 'new-password',
                      },
                      {
                        key: 'confirmPassword',
                        label: '새 비밀번호 확인',
                        autocomplete: 'new-password',
                      },
                    ].map(({ key, label, note, autocomplete }) => (
                      <div key={key}>
                        <label className="form-label">{label}</label>
                        <input
                          type="password"
                          value={(passwordForm as Record<string, string>)[key]}
                          onChange={e =>
                            setPasswordForm(prev => ({ ...prev, [key]: e.target.value }))
                          }
                          autoComplete={autocomplete}
                          disabled={isChangingPassword}
                          className="input px-4 py-3"
                          placeholder={note}
                        />
                      </div>
                    ))}
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="btn-primary w-full"
                    >
                      {isChangingPassword ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          변경 중...
                        </span>
                      ) : (
                        '비밀번호 변경'
                      )}
                    </button>
                  </form>
                </div>

                {/* 2단계 인증 */}
                <div className="card p-6">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-5">
                    2단계 인증 (2FA)
                  </h3>
                  <TwoFactorSettings />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </PageContainer>
    </div>
  );
}

// ─── 헬퍼 컴포넌트 ──────────────────────────────────────────────────────────

function InfoRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:w-28 flex-shrink-0">
        {label}
      </span>
      <div className="flex-1">
        <span className="text-sm text-slate-900 dark:text-slate-100 font-medium">{value}</span>
        {note && <span className="ml-2 text-xs text-slate-400">({note})</span>}
      </div>
    </div>
  );
}

function PermBadge({ label, granted }: { label: string; granted: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full ${
        granted
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
      }`}
    >
      {granted ? (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )}
      {label}
    </span>
  );
}
