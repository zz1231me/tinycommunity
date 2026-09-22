import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCodeHighlight } from '../../hooks/useCodeHighlight';
import { copyText } from '../../utils/clipboard';
import {
  VirtualizedCommentList,
  VIRTUALIZE_THRESHOLD,
} from '../../components/boards/VirtualizedCommentList';
import { useParams } from 'react-router-dom';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import { ClassicEditor, type EditorConfig } from 'ckeditor5';
import { buildEditorConfig } from '../../components/editor/core/editorConfig';
import axios from '../../api/axios';
import { useAuth } from '../../store/auth';
import { ReportButton } from '../../components/boards/ReportButton';
import { CommentReactions } from '../../components/boards/CommentReactions';
import { Avatar } from '../../components/Avatar';
import { formatRelativeDate, formatFullDateTime, toISOString } from '../../utils/date';
import { highlightMentions, sanitizeCommentHTML } from '../../utils/htmlSanitizer';
import MentionAutocomplete, {
  type MentionEditor,
} from '../../components/editor/MentionAutocomplete';
import { toast } from '../../utils/toast';
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
      aria-hidden="true"
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

/** 댓글 본문 렌더러. sanitizeCommentHTML 로 정화한 뒤 코드 하이라이팅을 건다. */
const CommentContent = React.memo<{ content: string }>(({ content }) => {
  const ref = useRef<HTMLDivElement>(null);
  // 정화 이후에 멘션을 강조한다(정화 전에 넣으면 삽입한 span 이 제거될 수 있다)
  const sanitized = highlightMentions(sanitizeCommentHTML(content));
  // dangerouslySetInnerHTML 은 객체 참조로 비교하므로 객체도 메모해야 본문이 다시 붙지 않는다.
  const bodyHtml = useMemo(() => ({ __html: sanitized }), [sanitized]);
  useCodeHighlight(ref);
  return (
    <div
      ref={ref}
      className="ck-content-view text-sm bg-slate-50 dark:bg-slate-700/40 rounded-xl px-4 py-3"
      dangerouslySetInnerHTML={bodyHtml}
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
  // @멘션 자동완성이 붙을 CKEditor 인스턴스
  const [mentionEditor, setMentionEditor] = useState<MentionEditor | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  // 'popular'(추천순)은 댓글 좋아요 기능이 없어 항상 등록순과 동일하므로 옵션에서 제외
  const [sortBy, setSortBy] = useState<'oldest' | 'newest'>('oldest');
  const [copied, setCopied] = useState(false);
  // 좋아요 토글 in-flight 가드. 댓글 id 마다 한 요청만 보낸다.
  const likeInFlight = useRef<Set<number>>(new Set());
  // 이모지 리액션 in-flight 가드. 댓글 id 와 이모지 조합마다 한 요청만 보낸다.
  const reactionInFlight = useRef<Set<string>>(new Set());

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

  // Enter 는 등록, Shift+Enter 는 줄바꿈. 핸들러가 onReady 에서 한 번만 붙으므로 콜백을 ref 로 둔다.
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
        if (data.isSoft) return; // Shift+Enter 는 줄바꿈
        if (data.domEvent?.isComposing) return; // IME 조합 중 Enter 는 글자 확정용
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

  // 가상화는 스크롤 요소가 필요하다. 이 앱은 window 가 아니라 대시보드 본문이 스크롤한다.
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (commentTree.length <= VIRTUALIZE_THRESHOLD) return;
    // 조상 중 실제로 스크롤하는 요소를 찾는다
    let node = sectionRef.current?.parentElement ?? null;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      node = node.parentElement;
    }
    setScrollElement(node);
  }, [commentTree.length]);

  const handleCopyAll = useCallback(async () => {
    const text = flattenCommentsText(commentTree).join('\n');
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('댓글 복사에 실패했습니다.');
    }
  }, [commentTree]);

  // 낙관적으로 바꾸고 서버 값으로 보정한다. 트리는 평면 배열에서 파생되므로 평면만 갱신한다.
  const handleToggleCommentLike = useCallback(
    async (comment: Comment) => {
      if (comment.isDeleted) return;
      if (!isAuthenticated) {
        toast.error('로그인이 필요합니다.');
        return;
      }
      if (!boardType) return;
      const id = comment.id;
      if (id < 0) return; // 아직 서버에 없는 임시 댓글
      if (likeInFlight.current.has(id)) return; // 진행 중이면 무시
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

  // 다중 이모지라 낙관적 계산이 복잡해 서버 응답을 그대로 반영한다.
  const handleToggleReaction = useCallback(
    async (comment: Comment, emoji: string) => {
      if (comment.isDeleted) return;
      if (!isAuthenticated) {
        toast.error('로그인이 필요합니다.');
        return;
      }
      if (!boardType) return;
      const id = comment.id;
      if (id < 0) return; // 아직 서버에 없는 임시 댓글
      const key = `${id}:${emoji}`;
      if (reactionInFlight.current.has(key)) return;
      reactionInFlight.current.add(key);
      try {
        const res = await axios.post(`/comments/${boardType}/${id}/reactions`, { emoji });
        const data = res.data?.data ?? res.data;
        setComments(prev =>
          prev.map(c => (c.id === id ? { ...c, reactions: data?.reactions ?? [] } : c))
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        toast.error(err.response?.data?.message || '리액션 처리에 실패했습니다.');
      } finally {
        reactionInFlight.current.delete(key);
      }
    },
    [boardType, isAuthenticated]
  );

  const newCommentLen = getTextLength(ops.newComment);
  const editCommentLen = getTextLength(ops.editContent);
  const replyCommentLen = getTextLength(ops.replyContent);

  // 단일 댓글 행 렌더러. replies 를 재귀적으로 그린다.
  const renderComment = useCallback(
    (comment: Comment, isReply = false): React.ReactNode => {
      // 답글이 남아 트리 보존용으로 내려온 placeholder. 안내만 보여 주고 계층은 유지한다.
      if (comment.isDeleted) {
        return (
          <div key={comment.id}>
            <div
              className={`py-4 ${isReply ? 'pl-4 border-l-2 border-slate-200 dark:border-slate-700 ml-3' : ''}`}
            >
              <p className="text-sm italic text-slate-400">삭제된 댓글입니다.</p>
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
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-3"
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
                enlargeable
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span
                      className={`text-sm font-semibold truncate ${
                        isDeletedUser
                          ? 'text-slate-400 italic'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {userName}
                    </span>
                    {isReply && (
                      <span className="badge badge-primary px-1.5 flex-shrink-0">답글</span>
                    )}
                    <time
                      dateTime={toISOString(comment.createdAt)}
                      title={formatFullDateTime(comment.createdAt)}
                      className="text-xs text-slate-400 flex-shrink-0 cursor-default"
                    >
                      {formatRelativeDate(comment.createdAt)}
                    </time>
                    {comment.isEdited && (
                      <span className="badge badge-warning px-1.5 flex-shrink-0">수정됨</span>
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
                                  className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400
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
                            className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400
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
                          editCommentLen > 900 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'
                        }`}
                      >
                        {editCommentLen.toLocaleString()}/{ops.MAX_CHARS}자
                      </span>
                      <div className="flex gap-2">
                        <button onClick={ops.handleEditCancel} className="btn-secondary">
                          취소
                        </button>
                        <button
                          onClick={() => ops.handleEditSave(comment.id)}
                          disabled={
                            !editCommentLen ||
                            editCommentLen > ops.MAX_CHARS ||
                            ops.editContent === comment.content
                          }
                          className="btn-primary"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <CommentContent content={comment.content} />
                    {/* 좋아요 + 이모지 리액션 */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
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
                          aria-hidden="true"
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
                      <CommentReactions
                        comment={comment}
                        canReact={isAuthenticated}
                        onToggle={handleToggleReaction}
                      />
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
                            : 'text-slate-400'
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
                          className="btn-secondary"
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
                          className="btn-primary"
                        >
                          {ops.replySubmitting ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              작성 중...
                            </>
                          ) : (
                            <>
                              <svg
                                aria-hidden="true"
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
    <div ref={sectionRef} className="space-y-6">
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
                <span className="ml-1 text-slate-400">
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
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {option === 'oldest' ? '등록순' : '최신순'}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCopyAll}
                title="댓글 전체 복사"
                className={`flex items-center gap-1 px-3 py-1 text-xs rounded-full border transition-colors ${
                  copied
                    ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {copied ? (
                  <>
                    <svg
                      aria-hidden="true"
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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
                    <svg
                      aria-hidden="true"
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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
            {commentTree.length > VIRTUALIZE_THRESHOLD ? (
              // 댓글이 많으면 보이는 것만 그린다
              <VirtualizedCommentList
                items={commentTree}
                keyOf={c => c.id}
                renderItem={comment => renderComment(comment, false)}
                scrollElement={scrollElement}
              />
            ) : (
              commentTree.map(comment => renderComment(comment, false))
            )}
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
                    setMentionEditor(editor as unknown as MentionEditor);
                  }}
                  onChange={(_e, editor) => ops.setNewComment(editor.getData())}
                  disabled={ops.submitting}
                />
                <MentionAutocomplete editor={mentionEditor} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-xs ${
                      newCommentLen > 900 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'
                    }`}
                  >
                    {newCommentLen.toLocaleString()}/{ops.MAX_CHARS}자
                  </span>
                  <span className="hidden sm:inline text-xs text-slate-400">
                    · Enter 등록, Shift+Enter 줄바꿈
                  </span>
                </div>
                <button
                  onClick={() => ops.handleSubmit(setComments)}
                  disabled={!newCommentLen || newCommentLen > ops.MAX_CHARS || ops.submitting}
                  className="btn-primary"
                >
                  {ops.submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      작성 중...
                    </>
                  ) : (
                    <>
                      <svg
                        aria-hidden="true"
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
                aria-hidden="true"
                className="w-6 h-6 text-slate-400"
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
            <h3 className="card-title mb-1">로그인이 필요합니다</h3>
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
