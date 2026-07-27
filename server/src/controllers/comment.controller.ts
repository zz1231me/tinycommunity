// src/controllers/comment.controller.ts - Service Layer 적용
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { commentService } from '../services/comment.service';
import { commentLikeService } from '../services/commentLike.service';
import { notificationService } from '../services/notification.service';
import {
  sendSuccess,
  sendUnauthorized,
  sendForbidden,
  sendValidationError,
  sendNotFound,
} from '../utils/response';
import { logError } from '../utils/logger';
import { getSettings } from '../utils/settingsCache';
import { checkSecretPostAccess, SecretPostFields } from '../utils/postAccess';
import { Post } from '../models/Post';
import { Comment } from '../models/Comment';

// 댓글 길이는 클라이언트(useCommentOperations.getTextLength)와 동일하게 태그·&nbsp; 제거 후
// 텍스트 길이로 센다. raw HTML 길이로 세면 서식이 많은 댓글이 클라 카운터(950/1000)와 다르게
// 서버에서 거부되는 불일치가 생긴다.
const commentTextLength = (content: string): number =>
  content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length;

// ✅ 댓글 작성
export const createComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { boardType, postId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      sendUnauthorized(res, '로그인이 필요합니다.');
      return;
    }

    if (req.user?.role === 'guest' && !getSettings().allowGuestComment) {
      sendForbidden(res, '게스트는 댓글을 작성할 수 없습니다.');
      return;
    }

    if (!content || commentTextLength(content) === 0) {
      sendValidationError(res, 'content', '댓글 내용을 입력해주세요.');
      return;
    }

    const commentMaxLen = getSettings().commentContentMaxLength;
    if (commentTextLength(content) > commentMaxLen) {
      sendValidationError(res, 'content', `댓글은 ${commentMaxLen}자 이내로 작성해주세요.`);
      return;
    }

    // parentId 타입 검증: 정수만 허용 (소수점, 문자열 등 방지)
    if (parentId !== undefined && parentId !== null) {
      const parsedParentId = Number(parentId);
      if (!Number.isInteger(parsedParentId) || parsedParentId <= 0) {
        sendValidationError(res, 'parentId', '유효하지 않은 부모 댓글 ID입니다.');
        return;
      }
    }

    // ✅ 게시글 존재 여부 확인 + 알림용 정보를 한 번에 조회
    const post = await Post.findByPk(postId, {
      attributes: ['id', 'UserId', 'title', 'boardType', 'isSecret', 'secretType', 'secretUserIds'],
    });
    if (!post) {
      sendNotFound(res, '게시글');
      return;
    }

    // ✅ URL의 boardType과 실제 게시글의 boardType 일치 여부 검증
    // 미들웨어(checkWriteAccess)는 URL 파라미터로만 권한을 확인하므로,
    // boardType을 조작해 다른 게시판 포스트에 댓글을 다는 공격을 차단
    if (post.boardType !== boardType) {
      sendNotFound(res, '게시글');
      return;
    }

    // ✅ 비밀글 보호: 작성자/허용 사용자/관리자만 댓글 가능
    const access = checkSecretPostAccess(post, userId, req.user?.role);
    if (!access.ok) {
      sendForbidden(res, access.message);
      return;
    }

    const authorName = req.user?.name || '알 수 없음';
    const comment = await commentService.createComment(
      postId,
      userId,
      content,
      authorName,
      parentId
    );

    const commenterName = req.user?.name || '누군가';

    // 알림 1: 내 글에 댓글 달린 경우 → 게시글 작성자에게 알림
    if (post.UserId && post.UserId !== userId) {
      notificationService
        .create({
          userId: post.UserId,
          type: 'COMMENT',
          message: `${commenterName}님이 "${post.title}" 게시글에 댓글을 남겼습니다.`,
          link: `/dashboard/posts/${post.boardType}/${postId}`,
          relatedId: postId,
        })
        .catch(err => logError('댓글 알림 생성 실패', err));
    }

    sendSuccess(res, comment, '댓글이 작성되었습니다.', 201);

    // 알림 2: 내 댓글에 대댓글 달린 경우 → 원댓글 작성자에게 알림 (fire-and-forget, 응답 후 처리)
    if (parentId) {
      void Comment.findByPk(parentId, { attributes: ['UserId'] })
        .then(parentComment => {
          if (
            parentComment?.UserId &&
            parentComment.UserId !== userId &&
            parentComment.UserId !== post.UserId
          ) {
            notificationService
              .create({
                userId: parentComment.UserId,
                type: 'COMMENT',
                message: `${commenterName}님이 회원님의 댓글에 답글을 남겼습니다.`,
                link: `/dashboard/posts/${post.boardType}/${postId}`,
                relatedId: postId,
              })
              .catch(err => logError('대댓글 알림 생성 실패', err));
          }
        })
        .catch(err => logError('대댓글 작성자 조회 실패', err));
    }
  } catch (err) {
    next(err);
  }
};

// ✅ 게시글의 댓글 조회
export const getCommentsByPost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { boardType, postId } = req.params;
    const sortBy = (req.query.sortBy as string) ?? 'oldest';
    const validSorts = ['oldest', 'newest', 'popular'];
    const sort = validSorts.includes(sortBy)
      ? (sortBy as 'oldest' | 'newest' | 'popular')
      : 'oldest';
    const userId = req.user?.id;

    // boardType 교차 검증: 다른 게시판의 댓글을 URL 조작으로 읽는 공격 차단
    const post = await Post.findByPk(postId, {
      attributes: ['id', 'UserId', 'boardType', 'isSecret', 'secretType', 'secretUserIds'],
    });
    if (!post || post.boardType !== boardType) {
      sendNotFound(res, '게시글');
      return;
    }

    // ✅ 비밀글 보호: 본문과 마찬가지로 댓글 목록도 비밀글 정책에 따라 차단
    if (post.isSecret) {
      if (!userId) {
        sendUnauthorized(res, '로그인이 필요합니다.');
        return;
      }
      const access = checkSecretPostAccess(post, userId, req.user?.role);
      if (!access.ok) {
        sendForbidden(res, access.message);
        return;
      }
    }

    const comments = await commentService.getCommentsByPost(postId, sort, userId);
    sendSuccess(res, comments, '댓글 목록 조회 성공');
  } catch (err) {
    next(err);
  }
};

// ✅ 댓글 수정
export const updateComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { boardType, commentId } = req.params;
    const { content } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      sendUnauthorized(res, '로그인이 필요합니다.');
      return;
    }

    if (!content || commentTextLength(content) === 0) {
      sendValidationError(res, 'content', '댓글 내용을 입력해주세요.');
      return;
    }

    const commentMaxLen = getSettings().commentContentMaxLength;
    if (commentTextLength(content) > commentMaxLen) {
      sendValidationError(res, 'content', `댓글은 ${commentMaxLen}자 이내로 작성해주세요.`);
      return;
    }

    const numericCommentId = parseInt(commentId, 10);
    if (isNaN(numericCommentId)) {
      sendValidationError(res, 'commentId', '잘못된 댓글 ID입니다.');
      return;
    }

    // boardType 교차 검증: 댓글이 올바른 게시판 소속인지 확인
    const comment = await Comment.findByPk(numericCommentId, {
      include: [{ model: Post, as: 'post', attributes: ['boardType'] }],
    });
    if (!comment) {
      sendNotFound(res, '댓글');
      return;
    }
    const post = (comment as Comment & { post?: { boardType: string } }).post;
    if (!post || post.boardType !== boardType) {
      sendNotFound(res, '댓글');
      return;
    }

    const updatedComment = await commentService.updateComment(
      numericCommentId,
      userId,
      userRole || 'guest',
      content
    );

    sendSuccess(res, updatedComment, '댓글이 수정되었습니다.');
  } catch (err) {
    next(err);
  }
};

// ✅ 댓글 삭제
export const deleteComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { boardType, commentId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      sendUnauthorized(res, '로그인이 필요합니다.');
      return;
    }

    const numericCommentId = parseInt(commentId, 10);
    if (isNaN(numericCommentId)) {
      sendValidationError(res, 'commentId', '잘못된 댓글 ID입니다.');
      return;
    }

    // boardType 교차 검증: 댓글이 올바른 게시판 소속인지 확인
    const comment = await Comment.findByPk(numericCommentId, {
      include: [{ model: Post, as: 'post', attributes: ['boardType'] }],
    });
    if (!comment) {
      sendNotFound(res, '댓글');
      return;
    }
    const post = (comment as Comment & { post?: { boardType: string } }).post;
    if (!post || post.boardType !== boardType) {
      sendNotFound(res, '댓글');
      return;
    }

    await commentService.deleteComment(numericCommentId, userId, userRole || 'guest');

    sendSuccess(res, { deletedCommentId: numericCommentId }, '댓글이 삭제되었습니다.');
  } catch (err) {
    next(err);
  }
};

// ✅ 댓글 좋아요 토글
export const likeComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { boardType, commentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendUnauthorized(res, '로그인이 필요합니다.');
      return;
    }

    const numericCommentId = parseInt(commentId, 10);
    if (isNaN(numericCommentId)) {
      sendValidationError(res, 'commentId', '잘못된 댓글 ID입니다.');
      return;
    }

    // boardType 교차 검증 + 비밀글 보호 필드 함께 조회 (URL 조작/IDOR 차단)
    const comment = await Comment.findByPk(numericCommentId, {
      include: [
        {
          model: Post,
          as: 'post',
          attributes: ['boardType', 'UserId', 'isSecret', 'secretType', 'secretUserIds'],
        },
      ],
    });
    if (!comment) {
      sendNotFound(res, '댓글');
      return;
    }
    const post = (comment as Comment & { post?: SecretPostFields & { boardType: string } }).post;
    if (!post || post.boardType !== boardType) {
      sendNotFound(res, '댓글');
      return;
    }

    // ✅ 비밀글 보호: 댓글 작성/조회와 동일하게, 게시판 읽기 권한만으론 부족하고
    //    비밀글 접근 권한(작성자/허용 사용자/관리자)이 있어야 좋아요 가능
    const access = checkSecretPostAccess(post, userId, req.user?.role);
    if (!access.ok) {
      sendForbidden(res, access.message);
      return;
    }

    const result = await commentLikeService.toggleLike(numericCommentId, userId);

    sendSuccess(res, result, result.liked ? '좋아요를 눌렀습니다.' : '좋아요를 취소했습니다.');

    // 좋아요를 누른 경우(취소 제외) 댓글 작성자에게 알림 — 게시글 좋아요와 동일 패턴(fire-and-forget)
    if (result.liked && comment.UserId && comment.UserId !== userId) {
      const likerName = req.user?.name || '누군가';
      notificationService
        .create({
          userId: comment.UserId,
          type: 'LIKE',
          message: `${likerName}님이 회원님의 댓글에 좋아요를 눌렀습니다.`,
          link: `/dashboard/posts/${boardType}/${comment.PostId}`,
          relatedId: String(comment.PostId),
        })
        .catch(notifErr => logError('댓글 좋아요 알림 생성 실패', notifErr));
    }
  } catch (err) {
    next(err);
  }
};
