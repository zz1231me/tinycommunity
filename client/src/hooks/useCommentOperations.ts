import { useState, useCallback, useRef } from 'react';
import axios from '../api/axios';
import { useAuth } from '../store/auth';
import { useSiteSettings } from '../store/siteSettings';

export interface Comment {
  id: number;
  content: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  UserId: string | null;
  PostId: string;
  user?: { id: string; name: string; avatar?: string | null };
  User?: { name: string; avatar?: string | null };
  parentId?: number | null;
  depth?: number;
  replies?: Comment[];
  /** 자식이 살아있어 트리 보존을 위해 표시되는 '삭제된 댓글' placeholder */
  isDeleted?: boolean;
  /** 좋아요 수 (서버 비정규화 컬럼) */
  likeCount?: number;
  /** 현재 사용자가 좋아요했는지 여부 */
  liked?: boolean;
  /** 이모지 리액션 집계 (emoji별 개수 + 내가 눌렀는지) */
  reactions?: CommentReaction[];
}

export interface CommentReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

let _optimisticIdCounter = 0; // Number.MAX_SAFE_INTEGER로 wrapping해 overflow 방지

/** HTML 태그를 제거하고 실제 문자 수 반환 */
export const getTextLength = (html: string): number =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length;

interface UseCommentOperationsOptions {
  postId: string;
  boardType: string | undefined;
  onRefresh: (signal?: AbortSignal) => Promise<void>;
}

export function useCommentOperations({
  postId,
  boardType,
  onRefresh,
}: UseCommentOperationsOptions) {
  const { getUserId, getUser } = useAuth();
  const currentUserId = getUserId();
  const currentUser = getUser();
  const MAX_CHARS = useSiteSettings(s => s.settings.commentContentMaxLength);

  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const writeEditorRef = useRef<{ setData: (d: string) => void } | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState('');
  const replyEditorRef = useRef<{ setData: (d: string) => void } | null>(null);

  const handleSubmit = useCallback(
    async (setComments: React.Dispatch<React.SetStateAction<Comment[]>>) => {
      const textLen = getTextLength(newComment);
      if (!textLen || textLen > MAX_CHARS || !boardType || submitting) return;

      const commentHtml = newComment;
      _optimisticIdCounter = (_optimisticIdCounter + 1) % Number.MAX_SAFE_INTEGER;
      const tempId = -_optimisticIdCounter;
      const optimisticComment: Comment = {
        id: tempId,
        content: commentHtml,
        author: currentUser?.name || '나',
        UserId: currentUserId || null,
        PostId: postId,
        createdAt: new Date().toISOString(),
        user: currentUser
          ? { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar ?? null }
          : undefined,
      };

      setComments(prev => [...prev, optimisticComment]);
      setNewComment('');
      writeEditorRef.current?.setData('');
      setSubmitError('');
      setSubmitting(true);

      try {
        await axios.post(`/comments/${boardType}/${postId}`, { content: commentHtml });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setComments(prev => prev.filter(c => c.id !== tempId));
        setNewComment(commentHtml);
        writeEditorRef.current?.setData(commentHtml);
        setSubmitError(err.response?.data?.message || err.message || '댓글 작성에 실패했습니다.');
        return;
      } finally {
        setSubmitting(false);
      }

      // 서버에는 이미 달렸다. 갱신 실패를 작성 실패로 알리면 같은 댓글이 두 번 달린다.
      await onRefresh().catch(() => {});
    },
    [newComment, boardType, submitting, postId, currentUser, currentUserId, onRefresh, MAX_CHARS]
  );

  const handleReplySubmit = useCallback(
    async (parentId: number) => {
      const textLen = getTextLength(replyContent);
      if (!textLen || textLen > MAX_CHARS || !boardType || replySubmitting) return;

      setReplySubmitting(true);
      setReplyError('');

      try {
        await axios.post(`/comments/${boardType}/${postId}`, { content: replyContent, parentId });
        setReplyingToId(null);
        setReplyContent('');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setReplyError(err.response?.data?.message || err.message || '답글 작성에 실패했습니다.');
        return;
      } finally {
        setReplySubmitting(false);
      }

      // 이미 달린 답글이라 갱신 실패를 작성 실패로 알리지 않는다.
      await onRefresh().catch(() => {});
    },
    [replyContent, boardType, replySubmitting, postId, onRefresh, MAX_CHARS]
  );

  const handleReplyOpen = useCallback(
    (commentId: number) => {
      if (replyingToId === commentId) {
        setReplyingToId(null);
        setReplyContent('');
        setReplyError('');
      } else {
        setReplyingToId(commentId);
        setReplyContent('');
        setReplyError('');
        setEditingCommentId(null);
      }
    },
    [replyingToId]
  );

  const handleEditStart = useCallback((comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
    setEditError('');
    setDeleteConfirmId(null);
    setReplyingToId(null);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingCommentId(null);
    setEditContent('');
    setEditError('');
  }, []);

  const handleEditSave = useCallback(
    async (commentId: number) => {
      const textLen = getTextLength(editContent);
      if (!textLen || textLen > MAX_CHARS || !boardType || editSaving) return;

      setEditSaving(true);
      try {
        await axios.put(`/comments/${boardType}/${commentId}`, { content: editContent });
        setEditingCommentId(null);
        setEditContent('');
        setEditError('');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setEditError(err.response?.data?.message || err.message || '댓글 수정에 실패했습니다.');
        return;
      } finally {
        setEditSaving(false);
      }

      // 이미 고쳐졌으므로 갱신 실패를 수정 실패로 알리지 않는다.
      await onRefresh().catch(() => {});
    },
    [editContent, boardType, editSaving, onRefresh, MAX_CHARS]
  );

  const handleDelete = useCallback(
    async (commentId: number) => {
      if (!boardType || deletingId !== null) return;
      setDeletingId(commentId);
      setDeleteError('');
      try {
        await axios.delete(`/comments/${boardType}/${commentId}`);
        setDeleteConfirmId(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        setDeleteError(err.response?.data?.message || err.message || '댓글 삭제에 실패했습니다.');
        return;
      } finally {
        setDeletingId(null);
      }

      // 이미 지워졌다. 갱신 실패를 삭제 실패로 알리면 다시 눌러 404 를 본다.
      await onRefresh().catch(() => {});
    },
    [boardType, deletingId, onRefresh]
  );

  return {
    newComment,
    setNewComment,
    submitting,
    submitError,
    setSubmitError,
    writeEditorRef,
    handleSubmit,
    editingCommentId,
    editContent,
    setEditContent,
    editError,
    editSaving,
    handleEditStart,
    handleEditCancel,
    handleEditSave,
    deleteConfirmId,
    setDeleteConfirmId,
    deletingId,
    deleteError,
    setDeleteError,
    handleDelete,
    replyingToId,
    setReplyingToId,
    replyContent,
    setReplyContent,
    replySubmitting,
    replyError,
    setReplyError,
    replyEditorRef,
    handleReplySubmit,
    handleReplyOpen,
    MAX_CHARS,
  };
}
