// src/hooks/usePostDetail.ts - 비밀글 + 좋아요 지원
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import {
  fetchPostById,
  deletePost,
  verifySecretPost,
  toggleLike,
  getLikeStatus,
} from '../api/posts';
import { checkIsBoardManager } from '../api/boardManagers';
import { formatRelativeDate } from '../utils/date';
import { getBoardTitle } from '../constants/boardTitles';
import { decryptContent } from '../utils/crypto';

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

  // 비밀글 상태
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

  // 좋아요 상태
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, getUserId, getUserName, isAdmin } = useAuth();

  const canEditOrDelete = useMemo(() => {
    if (!post || !user) return false;
    const currentUserId = getUserId();
    // UserId(서버에서 내려주는 작성자 PK)로 비교 (가장 정확)
    // fallback: author 이름으로 비교 (하위 호환)
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
        user: data.user,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
      });
    },
    [boardType]
  );

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

      // 좋아요 상태 초기화
      if (data.likeCount !== undefined) setLikeCount(data.likeCount);
      try {
        const likeStatus = await getLikeStatus(boardType, id);
        if (fetchIdRef.current !== fetchId) return; // Stale fetch
        setLiked(likeStatus.liked);
        setLikeCount(likeStatus.likeCount);
      } catch {
        /* 좋아요 상태 조회 실패는 무시 */
      }
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
  }, [boardType, id, setPostFromData]);

  // 비밀글 비밀번호 검증
  // - E2EE: 암호문만 가져와 클라이언트에서 복호화 (비밀번호 서버 미전송)
  // - 일반 비밀글: 서버에서 비밀번호 검증 후 평문 반환
  const handleVerifyPassword = useCallback(
    async (password: string) => {
      if (!boardType || !id) return;
      setVerifying(true);
      setVerifyError(null);
      try {
        if (lockedMeta?.isEncrypted) {
          // E2EE 경로: 서버에서 비밀번호 bcrypt 검증 + 암호문 수신 → 클라이언트에서 복호화
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
          // 일반 비밀글 경로: 서버에서 비밀번호 검증
          const data = await verifySecretPost(boardType, id, password);
          if (!mountedRef.current) return;
          setIsLocked(false);
          setLockedMeta(null);
          setPostFromData(data);
        }

        try {
          const likeStatus = await getLikeStatus(boardType, id);
          if (!mountedRef.current) return;
          setLiked(likeStatus.liked);
          setLikeCount(likeStatus.likeCount);
        } catch {
          /* 좋아요 상태 조회 실패는 무시 */
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
    [boardType, id, lockedMeta, setPostFromData]
  );

  // 좋아요 토글
  const handleToggleLike = useCallback(async () => {
    if (!boardType || !id || likeLoading) return;
    setLikeLoading(true);
    try {
      const result = await toggleLike(boardType, id);
      // 언마운트/다른 게시글 이동 후 응답이 도착해 잘못된 상태를 덮어쓰지 않도록 가드
      if (!mountedRef.current) return;
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (err) {
      if (import.meta.env.DEV) console.error('좋아요 처리 실패:', err);
    } finally {
      if (mountedRef.current) setLikeLoading(false);
    }
  }, [boardType, id, likeLoading]);

  const handleBack = useCallback(() => {
    // 목록에서 넘어온 경우 원래 목록 위치(페이지·검색·태그)로 복귀, 아니면 게시판 첫 페이지
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

  // 게시판 담당자 여부 확인 (개인공간 제외)
  useEffect(() => {
    if (!boardType || !user?.id) {
      setIsBoardManager(false);
      return;
    }
    let cancelled = false;
    checkIsBoardManager(boardType)
      .then(result => {
        if (!cancelled) setIsBoardManager(result);
      })
      .catch(() => {
        if (!cancelled) setIsBoardManager(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardType, user?.id]);

  return {
    post,
    loading,
    error,
    isDeleting,
    canEditOrDelete,
    isBoardManager,
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
