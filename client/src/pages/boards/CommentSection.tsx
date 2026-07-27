// client/src/pages/boards/CommentSection.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import { ClassicEditor, type EditorConfig } from 'ckeditor5';
import { buildEditorConfig } from '../../components/editor/core/editorConfig';
import axios from '../../api/axios';
import { useAuth } from '../../store/auth';
import { ReportButton } from '../../components/boards/ReportButton';
import { Avatar } from '../../components/Avatar';
import { formatRelativeDate, formatFullDateTime, toISOString } from '../../utils/date';
import { sanitizeCommentHTML } from '../../utils/htmlSanitizer';
import { toast } from '../../utils/toast';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/atom-one-dark.min.css';
import 'ckeditor5/ckeditor5.css';
import '../../components/editor/core/CKEditorOverride.css';
import '../../styles/CKContentView.css';
import {
  useCommentOperations,
  getTextLength,
  type Comment,
} from '../../hooks/useCommentOperations';
import { useSiteSettings } from '../../store/siteSettings';

export type { Comment };

interface CommentSectionProps {
  postId: string;
}

const getUserDisplayName = (comment: Comment): string => {
  if (comment.author?.trim()) return comment.author;
  if (comment.user?.name?.trim()) return comment.user.name;
  if (comment.User?.name?.trim()) return comment.User.name;
  if (comment.UserId?.trim()) return comment.UserId;
  return '알수없음';
};

const getUserAvatar = (comment: Comment): string | null =>
  comment.user?.avatar ?? comment.User?.avatar ?? null;

/** 평탄한 댓글 목록 → 트리 구조로 변환 */
const buildCommentTree = (flatList: Comment[]): Comment[] => {
  const map = new Map<number, Comment>();
  const roots: Comment[] = [];

  flatList.forEach(c => map.set(c.id, { ...c, replies: [] }));

  map.forEach(c => {
    if (c.parentId) {
      const parent = map.get(c.parentId);
      if (parent) {
        parent.replies = parent.replies ?? [];
        parent.replies.push(c);
      } else {
        roots.push(c);
      }
    } else {
      roots.push(c);
    }
  });

  return roots;
};

/** 인라인 에러 배너 */
interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}
const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss, onRetry }) => (
  <div
    role="alert"
    className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl"
  >
    <svg
      className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
    <p className="text-sm text-red-700 dark:text-red-300 flex-1">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="text-sm font-medium text-red-600 dark:text-red-400 underline hover:no-underline flex-shrink-0"
      >
        다시 시도
      </button>
    )}
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="text-sm font-medium text-red-600 dark:text-red-400 underline hover:no-underline flex-shrink-0"
      >
        닫기
      </button>
    )}
  </div>
);

/** 댓글 본문 렌더러 — DOMPurify sanitizeCommentHTML + hljs 코드 하이라이팅 */
const CommentContent = React.memo<{ content: string }>(({ content }) => {
  const ref = useRef<HTMLDivElement>(null);
  const sanitized = sanitizeCommentHTML(content);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('pre code').forEach(block => {
      if (!block.dataset.highlighted) hljs.highlightElement(block);
    });
  }, [sanitized]);
  // content is sanitized via DOMPurify (sanitizeCommentHTML) before rendering
  return (
    <div
      ref={ref}
      className="ck-content-view text-sm bg-slate-50 dark:bg-slate-700/40 rounded-xl px-4 py-3"
      dangerouslySetInnerHTML={{ __html: sanitized }} // sanitized via DOMPurify — safe
    />
  );
});
CommentContent.displayName = 'CommentContent';

const stripHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const flattenCommentsText = (list: Comment[], depth = 0): string[] => {
  const lines: string[] = [];
  for (const c of list) {
    const name = getUserDisplayName(c);
    const text = stripHtml(c.content);
    const prefix = depth > 0 ? '  '.repeat(depth) + '↳ ' : '';
    if (text) lines.push(`${prefix}${name}: ${text}`);
    if (c.replies?.length) lines.push(...flattenCommentsText(c.replies, depth + 1));
  }
  return lines;
};

const CommentSection: React.FC<CommentSectionProps> = ({ postId }) => {
  const { boardType } = useParams<{ boardType: string }>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  // 'popular'(추천순)은 댓글 좋아요 기능이 없어 항상 등록순과 동일하므로 옵션에서 제외
  const [sortBy, setSortBy] = useState<'oldest' | 'newest'>('oldest');
  const [copied, setCopied] = useState(false);
  // 좋아요 토글 in-flight 가드 (댓글 id별 1요청 — 더블클릭으로 인한 토글 꼬임 방지)
  const likeInFlight = useRef<Set<number>>(new Set());

  const { isAuthenticated, getUserId, getUser, isAdmin } = useAuth();
  const currentUserId = getUserId();
  const currentUser = getUser();
  const { settings: siteSettings } = useSiteSettings();

  const fetchComments = useCallback(
    async (signal?: AbortSignal) => {
      if (!boardType) return;
      setLoading(true);
      setFetchError('');
      try {
        const res = await axios.get(`/comments/${boardType}/${postId}`, {
          params: { sortBy },
          signal,
        });
        const data = res.data?.data ?? res.data;
        setComments(Array.isArray(data) ? data : []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setFetchError(err.response?.data?.message || err.message || '댓글을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [postId, boardType, sortBy]
  );

  const ops = useCommentOperations({
    postId,
    boardType,
    onRefresh: fetchComments,
  });

  const writeConfig = useMemo<EditorConfig>(
    () => buildEditorConfig('comment', { placeholder: '댓글을 입력하세요...' }),
    []
  );
  const editConfig = useMemo<EditorConfig>(
    () => buildEditorConfig('comment', { placeholder: '댓글을 수정하세요...' }),
    []
  );
  const replyConfig = useMemo<EditorConfig>(
    () => buildEditorConfig('comment', { placeholder: '답글을 입력하세요...' }),
    []
  );

  // Enter=등록 / Shift+Enter=줄바꿈.
  // CKEditor 기본은 Enter=새 문단이므로 hard-enter(비-soft)를 가로채 등록을 트리거한다.
  // 핸들러는 onReady에서 1회만 등록되므로, 최신 상태를 반영하도록 콜백을 ref에 매 렌더 갱신한다.
  const writeSubmitRef = useRef<() => void>(() => {});
  writeSubmitRef.current = () => ops.handleSubmit(setComments);
  const replySubmitRef = useRef<() => void>(() => {});
  replySubmitRef.current = () => {
    if (ops.replyingToId !== null) ops.handleReplySubmit(ops.replyingToId);
  };
  const editSaveRef = useRef<() => void>(() => {});
  editSaveRef.current = () => {
    if (ops.editingCommentId !== null) ops.handleEditSave(ops.editingCommentId);
  };

  const attachEnterToSubmit = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any,
    actionRef: React.MutableRefObject<() => void>
  ) => {
    editor.editing.view.document.on(
      'enter',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (evt: any, data: any) => {
        if (data.isSoft) return; // Shift+Enter → 줄바꿈(기본 동작 유지)
        if (data.domEvent?.isComposing) return; // 한글 등 IME 조합 중 Enter는 글자 확정용 — 무시
        data.preventDefault();
        evt.stop();
        actionRef.current();
      },
      { priority: 'high' }
    );
  };

  useEffect(() => {
    if (!postId || !boardType) return;
    const controller = new AbortController();
    fetchComments(controller.signal);
    return () => controller.abort();
  }, [postId, boardType, fetchComments]);

  const commentTree = useMemo(() => buildCommentTree(comments), [comments]);

  const handleCopyAll = useCallback(async () => {
    const text = flattenCommentsText(commentTree).join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // HTTP 환경 폴백: textarea를 잠깐 생성해 execCommand 사용
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사 실패(권한 거부 등) 시 사용자에게 피드백
      toast.error('댓글 복사에 실패했습니다.');
    }
  }, [commentTree]);

  // 댓글 좋아요 토글 — 낙관적 업데이트 + 서버 권위값 보정 + 실패 시 롤백.
  // comments는 평면 배열이고 트리는 파생되므로 평면 배열에서 id로 찾아 갱신하면 트리에도 반영된다.
  const handleToggleCommentLike = useCallback(
    async (comment: Comment) => {
      if (comment.isDeleted) return;
      if (!isAuthenticated) {
        toast.error('로그인이 필요합니다.');
        return;
      }
      if (!boardType) return;
      const id = comment.id;
      if (id < 0) return; // 아직 서버 저장 전(낙관적 임시) 댓글은 좋아요 불가
      if (likeInFlight.current.has(id)) return; // 진행 중이면 무시 (토글 꼬임 방지)
      likeInFlight.current.add(id);

      const prevLiked = !!comment.liked;
      const prevCount = comment.likeCount ?? 0;
      setComments(prev =>
        prev.map(c =>
          c.id === id ? { ...c, liked: !prevLiked, likeCount: prevCount + (prevLiked ? -1 : 1) } : c
        )
      );

      try {
        const res = await axios.post(`/comments/${boardType}/${id}/like`);
        const data = res.data?.data ?? res.data;
        setComments(prev =>
          prev.map(c =>
            c.id === id ? { ...c, liked: !!data?.liked, likeCount: data?.likeCount ?? 0 } : c
          )
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setComments(prev =>
          prev.map(c => (c.id === id ? { ...c, liked: prevLiked, likeCount: prevCount } : c))
        );
        toast.error(err.response?.data?.message || '좋아요 처리에 실패했습니다.');
      } finally {
        likeInFlight.current.delete(id);
      }
    },
    [boardType, isAuthenticated]
  );

  const newCommentLen = getTextLength(ops.newComment);
  const editCommentLen = getTextLength(ops.editContent);
  const replyCommentLen = getTextLength(ops.replyContent);

  // 단일 댓글 행 렌더러 (재귀적으로 replies 포함)
  const renderComment = useCallback(
    (comment: Comment, isReply = false): React.ReactNode => {
      // 삭제됐지만 답글이 살아있어 트리 보존용으로 내려온 placeholder — 내용/작성자/액션 없이
      // 음영 처리한 안내만 보여주고, 답글은 그대로 들여쓰기해 계층을 유지한다.
      if (comment.isDeleted) {
        return (
          <div key={comment.id}>
            <div
              className={`py-4 ${isReply ? 'pl-4 border-l-2 border-slate-200 dark:border-slate-700 ml-3' : ''}`}
            >
              <p className="text-sm italic text-slate-400 dark:text-slate-500">
                삭제된 댓글입니다.
              </p>
            </div>
            {comment.replies && comment.replies.length > 0 && (
              <div className="ml-3">{comment.replies.map(reply => renderComment(reply, true))}</div>
            )}
          </div>
        );
      }

      const commentUserId = comment.UserId || comment.user?.id;
      const isOwner = !!(
        currentUserId &&
        commentUserId &&
        String(currentUserId) === String(commentUserId)
      );
      const canModify = isAuthenticated && (isAdmin() || isOwner);
      const userName = getUserDisplayName(comment);
      const userAvatar = getUserAvatar(comment);
      const isEditing = ops.editingCommentId === comment.id;
      const isDeletedUser = userName.startsWith('삭제된계정_');
      const isReplyingHere = ops.replyingToId === comment.id;
      const canReply = isAuthenticated && (comment.depth ?? 0) < siteSettings.commentMaxDepth - 1;

      return (
        <div key={comment.id}>
          <div
            className={`group py-4 ${isReply ? 'pl-4 border-l-2 border-slate-200 dark:border-slate-700 ml-3' : ''}`}
          >
            <div className="flex items-start gap-3">
              {isReply && (
                <svg
                  className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a4 4 0 014 4v3m0 0l-3-3m3 3l-3 3"
                  />
                </svg>
              )}

              <Avatar
                user={{ id: commentUserId || '', name: userName, avatar: userAvatar }}
                size={isReply ? 'sm' : 'md'}
                variant={isDeletedUser ? 'muted' : 'gradient'}
                className="flex-shrink-0 mt-0.5"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span
                      className={`text-sm font-semibold truncate ${
                        isDeletedUser
                          ? 'text-slate-400 dark:text-slate-500 italic'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {userName}
                    </span>
                    {isReply && (
                      <span className="text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium">
                        답글
                      </span>
                    )}
                    <time
                      dateTime={toISOString(comment.createdAt)}
                      title={formatFullDateTime(comment.createdAt)}
                      className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 cursor-default"
                    >
                      {formatRelativeDate(comment.createdAt)}
                    </time>
                    {comment.isEdited && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        수정됨
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canReply && !isEditing && !isDeletedUser && (
                      <button
                        onClick={() => ops.handleReplyOpen(comment.id)}
                        className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                          isReplyingHere
                            ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                            : 'text-slate-500 dark:text-slate-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        답글
                      </button>
                    )}

                    {!canModify && !isDeletedUser && (
                      <ReportButton
                        targetType="comment"
                        targetId={comment.id}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      />
                    )}

                    {canModify && !isEditing && !isDeletedUser && (
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => ops.handleEditStart(comment)}
                          className="px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400
                                     hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                        >
                          수정
                        </button>
                        {ops.deleteConfirmId === comment.id ? (
                          <span className="flex items-center gap-1">
                            {ops.deletingId === comment.id ? (
                              <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                삭제 중...
                              </span>
                            ) : (
                              <>
                                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  삭제할까요?
                                </span>
                                <button
                                  onClick={() => ops.handleDelete(comment.id)}
                                  className="px-2 py-1 text-xs font-medium text-red-500 dark:text-red-400
                                             hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                >
                                  확인
                                </button>
                                <button
                                  onClick={() => ops.setDeleteConfirmId(null)}
                                  className="px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400
                                             hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                  취소
                                </button>
                              </>
                            )}
                          </span>
                        ) : (
                          <button
                            onClick={() => ops.setDeleteConfirmId(comment.id)}
                            className="px-2 py-1 text-xs font-medium text-red-500 dark:text-red-400
                                       hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <div className="comment-ck-editor-wrapper">
                      <CKEditor
                        key={`edit-${comment.id}`}
                        editor={ClassicEditor}
                        config={editConfig}
                        data={ops.editContent}
                        onReady={editor => attachEnterToSubmit(editor, editSaveRef)}
                        onChange={(_e, editor) => ops.setEditContent(editor.getData())}
                      />
                    </div>
                    {ops.editError && (
                      <p className="text-xs text-red-500 dark:text-red-400">{ops.editError}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs ${
                          editCommentLen > 900
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {editCommentLen.toLocaleString()}/{ops.MAX_CHARS}자
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={ops.handleEditCancel}
                          className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400
                                     hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => ops.handleEditSave(comment.id)}
                          disabled={
                            !editCommentLen ||
                            editCommentLen > ops.MAX_CHARS ||
                            ops.editContent === comment.content
                          }
                          className="px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg
                                     hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <CommentContent content={comment.content} />
                    {/* 좋아요 */}
                    <div className="mt-2 flex items-center">
                      <button
                        onClick={() => handleToggleCommentLike(comment)}
                        disabled={!isAuthenticated}
                        aria-pressed={!!comment.liked}
                        title={
                          isAuthenticated
                            ? comment.liked
                              ? '좋아요 취소'
                              : '좋아요'
                            : '로그인이 필요합니다'
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors disabled:cursor-not-allowed ${
                          comment.liked
                            ? 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill={comment.liked ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                        {(comment.likeCount ?? 0) > 0 && <span>{comment.likeCount}</span>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {isReplyingHere && (
              <div className="mt-3 ml-10 pl-4 border-l-2 border-primary-200 dark:border-primary-800/50">
                <div className="flex items-start gap-2">
                  <Avatar
                    user={{
                      id: currentUserId || '',
                      name: currentUser?.name || '',
                      avatar: currentUser?.avatar || null,
                    }}
                    size="sm"
                    className="flex-shrink-0 mt-1"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="comment-ck-editor-wrapper">
                      <CKEditor
                        key={`reply-${comment.id}`}
                        editor={ClassicEditor}
                        config={replyConfig}
                        data={ops.replyContent}
                        onReady={editor => {
                          ops.replyEditorRef.current = editor;
                          editor.editing?.view?.focus();
                          attachEnterToSubmit(editor, replySubmitRef);
                        }}
                        onChange={(_e, editor) => ops.setReplyContent(editor.getData())}
                      />
                    </div>
                    {ops.replyError && (
                      <p className="text-xs text-red-500 dark:text-red-400">{ops.replyError}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs ${
                          replyCommentLen > 900
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {replyCommentLen.toLocaleString()}/{ops.MAX_CHARS}자
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            ops.setReplyingToId(null);
                            ops.setReplyContent('');
                            ops.setReplyError('');
                          }}
                          className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400
                                     hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => ops.handleReplySubmit(comment.id)}
                          disabled={
                            !replyCommentLen ||
                            replyCommentLen > ops.MAX_CHARS ||
                            ops.replySubmitting
                          }
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white font-semibold text-sm
                                     rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed
                                     transition-colors"
                        >
                          {ops.replySubmitting ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              작성 중...
                            </>
                          ) : (
                            <>
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 10h10a4 4 0 014 4v3m0 0l-3-3m3 3l-3 3"
                                />
                              </svg>
                              답글 작성
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {comment.replies && comment.replies.length > 0 && (
            <div className="ml-3">{comment.replies.map(reply => renderComment(reply, true))}</div>
          )}
        </div>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      currentUserId,
      currentUser?.name,
      currentUser?.avatar,
      siteSettings.commentMaxDepth,
      isAuthenticated,
      isAdmin,
      ops.editingCommentId,
      ops.editContent,
      ops.editError,
      ops.deleteConfirmId,
      ops.deletingId,
      ops.replyingToId,
      ops.replyContent,
      ops.replyError,
      ops.replySubmitting,
      editCommentLen,
      replyCommentLen,
      editConfig,
      replyConfig,
      handleToggleCommentLike,
    ]
  );

  return (
    <div className="space-y-6">
      {fetchError && <ErrorBanner message={fetchError} onRetry={() => fetchComments()} />}
      {ops.submitError && (
        <ErrorBanner message={ops.submitError} onDismiss={() => ops.setSubmitError('')} />
      )}
      {ops.deleteError && (
        <ErrorBanner message={ops.deleteError} onDismiss={() => ops.setDeleteError('')} />
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex items-start gap-3 py-4">
              <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24" />
                <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              댓글 {comments.filter(c => !c.parentId).length}개
              {comments.length > comments.filter(c => !c.parentId).length && (
                <span className="ml-1 text-slate-400 dark:text-slate-500">
                  (답글 {comments.length - comments.filter(c => !c.parentId).length}개 포함)
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {(['oldest', 'newest'] as const).map(option => (
                  <button
                    key={option}
                    onClick={() => setSortBy(option)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      sortBy === option
                        ? 'bg-primary-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {option === 'oldest' ? '등록순' : '최신순'}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCopyAll}
                title="댓글 전체 복사"
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  copied
                    ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {copied ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    복사됨
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    전체 복사
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {commentTree.map(comment => renderComment(comment, false))}
          </div>
        </div>
      ) : null}

      {isAuthenticated ? (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <div className="flex items-start gap-3">
            <Avatar
              user={{
                id: currentUserId || '',
                name: currentUser?.name || '',
                avatar: currentUser?.avatar || null,
              }}
              size="md"
              className="flex-shrink-0 mt-1"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="comment-ck-editor-wrapper">
                <CKEditor
                  editor={ClassicEditor}
                  config={writeConfig}
                  data={ops.newComment}
                  onReady={editor => {
                    ops.writeEditorRef.current = editor;
                    attachEnterToSubmit(editor, writeSubmitRef);
                  }}
                  onChange={(_e, editor) => ops.setNewComment(editor.getData())}
                  disabled={ops.submitting}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-xs ${
                      newCommentLen > 900
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {newCommentLen.toLocaleString()}/{ops.MAX_CHARS}자
                  </span>
                  <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">
                    · Enter 등록, Shift+Enter 줄바꿈
                  </span>
                </div>
                <button
                  onClick={() => ops.handleSubmit(setComments)}
                  disabled={!newCommentLen || newCommentLen > ops.MAX_CHARS || ops.submitting}
                  className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white font-semibold text-sm
                             rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-colors shadow-sm"
                >
                  {ops.submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      작성 중...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                      댓글 작성
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-slate-400 dark:text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
              로그인이 필요합니다
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              댓글을 작성하려면 로그인해주세요
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommentSection;
