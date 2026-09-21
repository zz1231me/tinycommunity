import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { fetchPostById, deletePost, verifySecretPost, toggleLike } from '../api/posts';
import { formatRelativeDate } from '../utils/date';
import { toast } from '../utils/toast';
import { getApiErrorMessage } from '../api/utils';
import { getBoardTitle } from '../constants/boardTitles';
import { decryptContent } from '../utils/crypto';
import type { Assignee, WorkStatus } from '../api/tasks';
import type { Tag } from '../types/board.types';

/** 상세 응답에 함께 오는 "보는 사람의 상태" */
export interface ViewerState {
  liked: boolean;
  likeCount: number;
  scrapped: boolean;
  /** 관리자·매니저·이 게시판 담당자인지 */
  canManage: boolean;
}

export type Post = {
  id: string;
  title: string;
  content: string;
  author: string; // 표시용 이름 (user.name)
  UserId?: string; // 실제 작성자 ID (권한 체크용)
  createdAt: string;
  updatedAt: string;
  boardType: string;
  viewCount?: number;
  isSecret?: boolean;
  secretType?: 'password' | 'users' | null;
  isEncrypted?: boolean;
  secretSalt?: string | null;
  likeCount?: number;
  isPinned?: boolean;
  /** 상단 고정 만료 시각. 무기한이면 null. */
  pinnedUntil?: string | null;
  /** 업무 상태. 추적하지 않는 글은 'none'. */
  workStatus?: WorkStatus;
  assignee?: Assignee | null;
  /** 이 글이 속한 게시판 */
  board?: { id: string; name: string; taskEnabled: boolean } | null;
  /** 이 글의 태그 */
  tags?: Tag[];
  user?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  attachments?: Array<{
    url: string;
    originalName: string;
    storedName: string;
    size?: number;
    mimeType?: string;
  }>;
};

interface UsePostDetailProps {
  boardType: string | undefined;
  id: string | undefined;
}

export const usePostDetail = ({ boardType, id }: UsePostDetailProps) => {
  const fetchIdRef = useRef(0);
  const mountedRef = useRef(true);
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBoardManager, setIsBoardManager] = useState(false);

  const [isLocked, setIsLocked] = useState(false);
  const [lockedMeta, setLockedMeta] = useState<{
    id: string;
    title: string;
    secretType: 'password';
    isEncrypted?: boolean;
    ciphertext?: string;
    secretSalt?: string | null;
  } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);
  // 첫 값은 상세 응답에서 오고, 이후는 버튼이 들고 간다.
  const [scrapped, setScrapped] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, getUserId, getUserName, isAdmin } = useAuth();

  const canEditOrDelete = useMemo(() => {
    if (!post || !user) return false;
    const currentUserId = getUserId();
    // UserId 로 비교하고, 없는 옛 응답에서만 author 이름으로 비교한다.
    return (
      (post.UserId !== null && post.UserId !== undefined && post.UserId === currentUserId) ||
      post.author === getUserName() ||
      isAdmin() ||
      isBoardManager
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    post?.UserId,
    post?.author,
    user?.id,
    user?.name,
    getUserId,
    getUserName,
    isAdmin,
    isBoardManager,
  ]);

  const setPostFromData = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any, decryptedContent?: string) => {
      setPost({
        id: data.id,
        title: data.title,
        content: decryptedContent !== undefined ? decryptedContent : data.content,
        author: data.author,
        UserId: data.UserId, // 권한 체크용 작성자 ID
        createdAt: data.createdAt,
        updatedAt: data.updatedAt || data.createdAt,
        boardType: boardType!,
        viewCount: data.viewCount || 0,
        isSecret: data.isSecret,
        secretType: data.secretType,
        isEncrypted: data.isEncrypted,
        secretSalt: data.secretSalt,
        likeCount: data.likeCount ?? 0,
        isPinned: data.isPinned,
        pinnedUntil: data.pinnedUntil ?? null,
        workStatus: data.workStatus ?? 'none',
        assignee: data.assignee ?? null,
        board: data.board ?? null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        user: data.user,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
      });
    },
    [boardType]
  );

  /** 상세 응답의 viewer 를 반영한다. viewer 가 없는 옛 응답에서는 건드리지 않는다. */
  const applyViewer = useCallback((viewer: ViewerState | undefined) => {
    if (!viewer) return;
    setLiked(viewer.liked);
    setLikeCount(viewer.likeCount);
    setIsBoardManager(viewer.canManage);
    setScrapped(viewer.scrapped);
  }, []);

  const fetchPost = useCallback(async () => {
    if (!boardType || !id) {
      setError('잘못된 접근입니다.');
      setLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;

    try {
      setLoading(true);
      setError(null);

      const data = await fetchPostById(boardType, id);
      if (fetchIdRef.current !== fetchId) return; // Stale fetch — a newer one is in progress

      if (data?.isLocked) {
        setIsLocked(true);
        setLockedMeta({
          id: data.id,
          title: data.title,
          secretType: data.secretType,
          isEncrypted: data.isEncrypted,
          ciphertext: data.ciphertext,
          secretSalt: data.secretSalt,
        });
        return;
      }

      if (!data || !data.title || !data.content) {
        throw new Error('게시글 제목 또는 내용이 없습니다');
      }

      setIsLocked(false);
      setLockedMeta(null);
      setPostFromData(data);
      applyViewer(data.viewer);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (fetchIdRef.current !== fetchId) return; // Stale fetch
      if (err.response?.status === 403) {
        setError('접근 권한이 없습니다.');
      } else if (err.response?.status === 404) {
        setError('게시글을 찾을 수 없습니다.');
      } else {
        setError(
          err.response?.data?.message || err.message || '게시글을 불러오는 중 오류가 발생했습니다.'
        );
      }
    } finally {
      if (fetchIdRef.current === fetchId) setLoading(false);
    }
  }, [boardType, id, setPostFromData, applyViewer]);

  // E2EE 글은 비밀번호를 서버로 보내지 않고 암호문을 받아 클라이언트에서 푼다.
  const handleVerifyPassword = useCallback(
    async (password: string) => {
      if (!boardType || !id) return;
      setVerifying(true);
      setVerifyError(null);
      try {
        if (lockedMeta?.isEncrypted) {
          const data = await verifySecretPost(boardType, id, password);

          if (!data.isEncrypted || !data.secretSalt || !data.rawContent) {
            setVerifyError('암호화 게시글 데이터가 올바르지 않습니다.');
            return;
          }

          const plaintext = decryptContent(data.rawContent, password, data.secretSalt);
          if (plaintext === null) {
            setVerifyError('비밀번호가 올바르지 않습니다.');
            return;
          }

          if (!mountedRef.current) return;
          setIsLocked(false);
          setLockedMeta(null);
          setPostFromData(data, plaintext);
        } else {
          const data = await verifySecretPost(boardType, id, password);
          if (!mountedRef.current) return;
          setIsLocked(false);
          setLockedMeta(null);
          setPostFromData(data);
          applyViewer(data.viewer);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (!mountedRef.current) return;
        if (err.response?.status === 401) {
          setVerifyError('비밀번호가 올바르지 않습니다.');
        } else {
          setVerifyError(err.response?.data?.message || '비밀번호 확인 중 오류가 발생했습니다.');
        }
      } finally {
        if (mountedRef.current) setVerifying(false);
      }
    },
    [boardType, id, lockedMeta, setPostFromData, applyViewer]
  );

  // 왕복을 기다리지 않고 누르는 즉시 반영한다.
  const handleToggleLike = useCallback(async () => {
    if (!boardType || !id || likeLoading) return;

    const previous = { liked, likeCount };
    setLiked(!previous.liked);
    setLikeCount(Math.max(0, previous.likeCount + (previous.liked ? -1 : 1)));
    setLikeLoading(true);

    try {
      const result = await toggleLike(boardType, id);
      // 다른 글로 이동한 뒤 도착한 응답이 상태를 덮어쓰지 않게 막는다.
      if (!mountedRef.current) return;
      // 다른 탭에서 이미 눌렀을 수 있으므로 서버 값을 최종으로 쓴다.
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (err) {
      if (!mountedRef.current) return;
      setLiked(previous.liked);
      setLikeCount(previous.likeCount);
      toast.error(getApiErrorMessage(err, '좋아요 처리에 실패했습니다.'));
    } finally {
      if (mountedRef.current) setLikeLoading(false);
    }
  }, [boardType, id, likeLoading, liked, likeCount]);

  const handleBack = useCallback(() => {
    // 목록에서 넘어왔으면 그 위치로, 아니면 게시판 첫 페이지로 돌아간다.
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from || `/dashboard/posts/${boardType}`);
  }, [navigate, boardType, location.state]);

  const handleEdit = useCallback(() => {
    if (!canEditOrDelete) {
      setError('수정 권한이 없습니다.');
      return;
    }
    navigate(`/dashboard/posts/${boardType}/edit/${id}`);
  }, [navigate, boardType, id, canEditOrDelete]);

  const handleDelete = useCallback(async () => {
    if (!canEditOrDelete) {
      setError('삭제 권한이 없습니다.');
      return;
    }

    try {
      setIsDeleting(true);
      await deletePost(boardType!, id!);
      navigate(`/dashboard/posts/${boardType}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.response?.data?.message || '게시글 삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  }, [id, boardType, navigate, canEditOrDelete]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  // 담당자 여부는 상세 응답의 viewer.canManage 로 온다. 따로 묻지 않는다.

  return {
    post,
    loading,
    error,
    isDeleting,
    canEditOrDelete,
    isBoardManager,
    scrapped,
    isLocked,
    lockedMeta,
    verifyError,
    verifying,
    liked,
    likeCount,
    likeLoading,
    getBoardTitle,
    formatDate: formatRelativeDate,
    handleBack,
    handleEdit,
    handleDelete,
    handleVerifyPassword,
    handleToggleLike,
    refreshPost: fetchPost,
  };
};
