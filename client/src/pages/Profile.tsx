// client/src/pages/Profile.tsx - 탭 기반 재구성
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LoadingSpinner } from '../components/common/LoadingStates';
import { ArrowLeftIcon } from '../components/common/Icons';
import { PageContainer } from '../components/common/PageContainer';
import { scrollContentToTop } from '../utils/scroll';
import {
  User,
  FileText,
  MessageCircle,
  ShieldCheck,
  Settings,
  Lock,
  Check,
  X,
  LogOut,
  Monitor,
} from 'lucide-react';
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
import { getMyPosts, getMyComments, getSecurityLogs } from '../api/users';
import { toast } from '../utils/toast';
import { getRoleBadgeClass, getRoleName } from '../utils/roleUtils';
import { formatRelativeDate, formatDate, formatDateTime, formatRelative } from '../utils/date';

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
type TabId = 'profile' | 'posts' | 'comments' | 'security' | 'settings';
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: '프로필', icon: <User className="w-4 h-4" /> },
  { id: 'posts', label: '내 게시글', icon: <FileText className="w-4 h-4" /> },
  { id: 'comments', label: '내 댓글', icon: <MessageCircle className="w-4 h-4" /> },
  { id: 'security', label: '접속기록', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'settings', label: '계정설정', icon: <Settings className="w-4 h-4" /> },
];

// ─── 타입 정의 ──────────────────────────────────────────────────────────────
interface MyPost {
  id: string;
  title: string;
  boardType: string;
  createdAt: string;
  isSecret?: boolean;
  commentCount?: number;
  viewCount?: number;
}

interface MyComment {
  id: string;
  content: string;
  postTitle?: string;
  PostId?: string;
  boardType?: string;
  createdAt: string;
}

interface SecurityLog {
  id: string;
  action: string;
  ipAddress?: string;
  createdAt: string;
}

// ─── 서브 컴포넌트 ───────────────────────────────────────────────────────────
function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-slate-500">
      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-14 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate();
  const { getUser, updateUser, clearUser } = useAuth();
  const user = getUser();
  const { settings } = useSiteSettings();

  const [activeTab, setActiveTab] = useState<TabId>('profile');

  // 내 게시글
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [postsError, setPostsError] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotalPages, setPostsTotalPages] = useState(1);
  const [postsTotalCount, setPostsTotalCount] = useState(0);

  // 내 댓글
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsTotalPages, setCommentsTotalPages] = useState(1);
  const [commentsTotalCount, setCommentsTotalCount] = useState(0);

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
  const loadPosts = useCallback(async (page = 1) => {
    setPostsLoading(true);
    setPostsError(false);
    try {
      const data = await getMyPosts(page, 10);
      setMyPosts((data.posts as MyPost[]) ?? []);
      setPostsTotalPages(data.pagination?.totalPages ?? 1);
      setPostsTotalCount(data.pagination?.totalCount ?? 0);
      setPostsPage(page);
      setPostsLoaded(true);
    } catch {
      setPostsError(true);
      toast.error('게시글을 불러오지 못했습니다.');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const loadComments = useCallback(async (page = 1) => {
    setCommentsLoading(true);
    setCommentsError(false);
    try {
      const data = await getMyComments(page, 10);
      setMyComments((data.comments as MyComment[]) ?? []);
      setCommentsTotalPages(data.pagination?.totalPages ?? 1);
      setCommentsTotalCount(data.pagination?.totalCount ?? 0);
      setCommentsPage(page);
      setCommentsLoaded(true);
    } catch {
      setCommentsError(true);
      toast.error('댓글을 불러오지 못했습니다.');
    } finally {
      setCommentsLoading(false);
    }
  }, []);

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

  // loaded 플래그 기반 초기 로드 — 성공 전까지 탭 재진입 시마다 재시도 가능
  useEffect(() => {
    if (activeTab === 'posts' && !postsLoaded) loadPosts(1);
    if (activeTab === 'comments' && !commentsLoaded) loadComments(1);
    if (activeTab === 'security' && !securityLoaded) loadSecurity(1);
    if (activeTab === 'security' && !sessionsLoaded) loadSessions();
  }, [
    activeTab,
    postsLoaded,
    commentsLoaded,
    securityLoaded,
    sessionsLoaded,
    loadPosts,
    loadComments,
    loadSecurity,
    loadSessions,
  ]);

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
    // ✅ 복잡도 검증 (관리자 설정 기반)
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
        {/* 상단 헤더 */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="대시보드로"
          >
            <ArrowLeftIcon />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">마이페이지</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {user.name}님의 개인 공간
            </p>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-1 mb-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* 아바타 */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
                  <AvatarUpload
                    user={user}
                    onAvatarUpdate={url => updateUser({ avatar: url })}
                    size="xl"
                    showName={false}
                    allowDelete={true}
                  />
                  <h2 className="mt-4 font-bold text-slate-900 dark:text-slate-100 text-lg">
                    {user.name}
                  </h2>
                  <span
                    className={`inline-flex mt-2 px-3 py-1 rounded-full text-xs font-bold ${getRoleBadgeClass(user.role)}`}
                  >
                    {getRoleName(user.role)}
                  </span>
                </div>

                {/* 기본 정보 */}
                <div className="sm:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
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
                              if (e.key === 'Enter') handleNameSave();
                              if (e.key === 'Escape') handleNameCancel();
                            }}
                            maxLength={50}
                            autoFocus
                            className="flex-1 max-w-[200px] px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <button
                            onClick={handleNameSave}
                            disabled={isChangingName}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 rounded-lg transition-colors"
                          >
                            {isChangingName ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={handleNameCancel}
                            disabled={isChangingName}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
                            className="px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
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

            {/* 2. 내 게시글 탭 */}
            {activeTab === 'posts' && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    내가 작성한 게시글
                  </h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {postsTotalCount}건
                  </span>
                </div>
                {postsLoading ? (
                  <LoadingRows />
                ) : postsError ? (
                  <RetryState onRetry={() => loadPosts(postsPage)} />
                ) : myPosts.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="w-6 h-6" />}
                    text="아직 작성한 게시글이 없습니다."
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {myPosts.map(post => (
                      <li
                        key={post.id}
                        onClick={() => navigate(`/dashboard/posts/${post.boardType}/${post.id}`)}
                        className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                              {post.isSecret && (
                                <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              )}
                              {post.title}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                              <span>{post.boardType}</span>
                              <span>댓글 {post.commentCount ?? 0}</span>
                              <span>조회 {post.viewCount ?? 0}</span>
                            </div>
                          </div>
                          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                            {formatRelativeDate(post.createdAt)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {/* 페이지네이션 */}
                {postsTotalPages > 1 && (
                  <Pagination
                    page={postsPage}
                    totalPages={postsTotalPages}
                    onChange={p => loadPosts(p)}
                  />
                )}
              </div>
            )}

            {/* 3. 내 댓글 탭 */}
            {activeTab === 'comments' && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    내가 작성한 댓글
                  </h3>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {commentsTotalCount}건
                  </span>
                </div>
                {commentsLoading ? (
                  <LoadingRows />
                ) : commentsError ? (
                  <RetryState onRetry={() => loadComments(commentsPage)} />
                ) : myComments.length === 0 ? (
                  <EmptyState
                    icon={<MessageCircle className="w-6 h-6" />}
                    text="아직 작성한 댓글이 없습니다."
                  />
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {myComments.map(comment => (
                      <li
                        key={comment.id}
                        onClick={() =>
                          comment.PostId &&
                          comment.boardType &&
                          navigate(`/dashboard/posts/${comment.boardType}/${comment.PostId}`)
                        }
                        className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-primary-600 dark:text-primary-400 font-medium truncate mb-1">
                              {comment.postTitle ?? '게시글'}
                            </p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                              {comment.content
                                ?.replace(/<[^>]+>/g, ' ')
                                .replace(/&nbsp;/g, ' ')
                                .replace(/\u00A0/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim()}
                            </p>
                          </div>
                          <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                            {formatRelativeDate(comment.createdAt)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {commentsTotalPages > 1 && (
                  <Pagination
                    page={commentsPage}
                    totalPages={commentsTotalPages}
                    onChange={p => loadComments(p)}
                  />
                )}
              </div>
            )}

            {/* 4. 접속 기록 탭 */}
            {activeTab === 'security' && (
              <div className="mb-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">활성 세션</h3>
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
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                                    현재 기기
                                  </span>
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
                                  className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
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
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">접속 기록</h3>
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
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
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
            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* 비밀번호 변경 */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
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
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {label}
                        </label>
                        <input
                          type="password"
                          value={(passwordForm as Record<string, string>)[key]}
                          onChange={e =>
                            setPasswordForm(prev => ({ ...prev, [key]: e.target.value }))
                          }
                          autoComplete={autocomplete}
                          disabled={isChangingPassword}
                          className="w-full px-4 py-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                          placeholder={note}
                        />
                      </div>
                    ))}
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="w-full py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 rounded-lg transition-colors disabled:cursor-not-allowed"
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
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
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
function RetryState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 gap-3">
      <p className="text-sm">데이터를 불러오지 못했습니다.</p>
      <button
        onClick={onRetry}
        className="px-4 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
}

function InfoRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:w-28 flex-shrink-0">
        {label}
      </span>
      <div className="flex-1">
        <span className="text-sm text-slate-900 dark:text-slate-100 font-medium">{value}</span>
        {note && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">({note})</span>}
      </div>
    </div>
  );
}

function PermBadge({ label, granted }: { label: string; granted: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
        granted
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
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

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        이전
      </button>
      <span className="text-sm text-slate-600 dark:text-slate-400 min-w-16 text-center">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        다음
      </button>
    </div>
  );
}
