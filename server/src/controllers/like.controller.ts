import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
} from '../utils/response';
import { logError } from '../utils/logger';
import { likeService } from '../services/like.service';
import { AppError } from '../middlewares/error.middleware';
import { notificationService } from '../services/notification.service';
import { checkSecretPostAccess } from '../utils/postAccess';
import { Post } from '../models/Post';

// POST /api/posts/:boardType/:id/like  → 좋아요 토글
export const toggleLike = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType, id: postId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  try {
    // boardType 교차 검증: URL의 boardType이 실제 게시글 boardType과 일치해야 함 (IDOR 방지)
    const post = await Post.findByPk(postId, {
      attributes: ['UserId', 'title', 'boardType', 'isSecret', 'secretType', 'secretUserIds'],
    });
    if (!post) return sendNotFound(res, '게시글');
    if (post.boardType !== boardType) return sendNotFound(res, '게시글');

    // 비밀글 보호: 댓글과 동일한 정책
    const access = checkSecretPostAccess(post, userId, req.user?.role);
    if (!access.ok) return sendForbidden(res, access.message);

    const result = await likeService.toggleLike(postId, userId);

    // 좋아요를 누른 경우 게시글 작성자에게 알림 (fire-and-forget — 응답 차단 방지)
    if (result.liked && post.UserId && post.UserId !== userId) {
      const likerName = req.user?.name || '누군가';
      notificationService
        .create({
          userId: post.UserId,
          type: 'LIKE',
          message: `${likerName}님이 "${post.title}" 게시글에 좋아요를 눌렀습니다.`,
          link: `/dashboard/posts/${post.boardType}/${postId}`,
          relatedId: postId,
        })
        .catch(notifErr => logError('좋아요 알림 생성 실패', notifErr));
    }

    sendSuccess(res, result, result.liked ? '좋아요를 눌렀습니다.' : '좋아요를 취소했습니다.');
  } catch (err: unknown) {
    if (err instanceof AppError && err.statusCode === 404) return sendNotFound(res, '게시글');
    sendError(res, 500, '좋아요 처리 실패');
  }
};

// GET /api/posts/:boardType/:id/like  → 좋아요 상태 조회
export const getLikeStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType, id: postId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  try {
    // boardType 교차 검증 (IDOR 방지)
    const post = await Post.findByPk(postId, {
      attributes: ['UserId', 'boardType', 'isSecret', 'secretType', 'secretUserIds'],
    });
    if (!post || post.boardType !== boardType) return sendNotFound(res, '게시글');

    const access = checkSecretPostAccess(post, userId, req.user?.role);
    if (!access.ok) return sendForbidden(res, access.message);

    const result = await likeService.getLikeStatus(postId, userId);
    sendSuccess(res, result);
  } catch (_err) {
    sendError(res, 500, '좋아요 조회 실패');
  }
};
