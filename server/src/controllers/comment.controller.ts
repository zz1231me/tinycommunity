import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { commentService } from '../services/comment.service';
import { auditLogService } from '../services/auditLog.service';
import { commentLikeService } from '../services/commentLike.service';
import { commentReactionService } from '../services/commentReaction.service';
import { notificationService } from '../services/notification.service';
import { notifyMentions } from '../services/mention.service';
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

// 댓글 길이는 클라이언트(getTextLength)와 같게 태그·&nbsp; 를 제거한 텍스트 길이로 센다.
const commentTextLength = (content: string): number =>
  content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length;

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

    // parentId 는 정수만 허용한다.
    if (parentId !== undefined && parentId !== null) {
      const parsedParentId = Number(parentId);
      if (!Number.isInteger(parsedParentId) || parsedParentId <= 0) {
        sendValidationError(res, 'parentId', '유효하지 않은 부모 댓글 ID입니다.');
        return;
      }
    }

    const post = await Post.findByPk(postId, {
      attributes: ['id', 'UserId', 'title', 'boardType', 'isSecret', 'secretType', 'secretUserIds'],
    });
    if (!post) {
      sendNotFound(res, '게시글');
      return;
    }

    // boardType 을 조작해 다른 게시판 글에 댓글을 다는 것을 막는다. 미들웨어는 URL 파라미터만 본다.
    if (post.boardType !== boardType) {
      sendNotFound(res, '게시글');
      return;
    }

    // 비밀글 보호: 작성자/허용 사용자/관리자만 댓글 가능
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

    // 내 글에 댓글이 달리면 글쓴이에게 알린다.
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

    // 본문에서 @멘션된 사용자에게 알린다. 글쓴이는 위에서 이미 받았으므로 제외한다.
    void notifyMentions({
      content,
      actorId: userId,
      actorName: commenterName,
      boardType: post.boardType,
      post,
      excludeUserIds: post.UserId ? [post.UserId] : [],
      message: name => `${name}님이 댓글에서 회원님을 언급했습니다.`,
      link: `/dashboard/posts/${post.boardType}/${postId}`,
      relatedId: postId,
    });

    // 내 댓글에 대댓글이 달리면 원댓글 작성자에게 알린다.
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

    // 다른 게시판의 댓글을 URL 조작으로 읽는 것을 막는다.
    const post = await Post.findByPk(postId, {
      attributes: ['id', 'UserId', 'boardType', 'isSecret', 'secretType', 'secretUserIds'],
    });
    if (!post || post.boardType !== boardType) {
      sendNotFound(res, '게시글');
      return;
    }

    // 비밀글 보호: 본문과 마찬가지로 댓글 목록도 비밀글 정책에 따라 차단
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

    // 지운 뒤에는 내용을 알 수 없으므로 미리 발췌해 둔다(위에서 이미 읽어 둔 댓글이다).
    const excerpt = comment.content
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);

    await commentService.deleteComment(numericCommentId, userId, userRole || 'guest');

    auditLogService
      .createAuditLog({
        actorId: userId,
        actorName: req.user?.name ?? userId,
        action: 'delete_comment',
        targetType: 'comment',
        targetId: String(numericCommentId),
        targetName: excerpt,
        ipAddress: req.ip ?? null,
      })
      .catch(err => logError('댓글 삭제 감사 기록 실패', err));

    sendSuccess(res, { deletedCommentId: numericCommentId }, '댓글이 삭제되었습니다.');
  } catch (err) {
    next(err);
  }
};

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

    // 비밀글은 게시판 읽기 권한만으로는 부족하고, 접근 권한이 있어야 좋아요를 누를 수 있다.
    const access = checkSecretPostAccess(post, userId, req.user?.role);
    if (!access.ok) {
      sendForbidden(res, access.message);
      return;
    }

    const result = await commentLikeService.toggleLike(numericCommentId, userId);

    sendSuccess(res, result, result.liked ? '좋아요를 눌렀습니다.' : '좋아요를 취소했습니다.');

    // 좋아요를 누르면(취소 제외) 댓글 작성자에게 알린다.
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

// 이모지 리액션. likeComment 와 같은 boardType 교차검증과 비밀글 보호를 적용한다.
export const reactToComment = async (
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

    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';
    // 임의 텍스트 저장 방지. 실제 이모지(Extended_Pictographic)를 포함하고 길이 제한 안이어야 한다.
    if (!emoji || emoji.length > 32 || !/\p{Extended_Pictographic}/u.test(emoji)) {
      sendValidationError(res, 'emoji', '유효한 이모지가 아닙니다.');
      return;
    }

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

    const access = checkSecretPostAccess(post, userId, req.user?.role);
    if (!access.ok) {
      sendForbidden(res, access.message);
      return;
    }

    const reactions = await commentReactionService.toggleReaction(numericCommentId, userId, emoji);
    sendSuccess(res, { reactions }, '리액션이 반영되었습니다.');
  } catch (err) {
    next(err);
  }
};
