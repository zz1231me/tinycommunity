import { Comment } from '../models/Comment';
import { CommentLike } from '../models/CommentLike';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { BaseService } from './base.service';

export class CommentLikeService extends BaseService {
  /** 댓글 좋아요 토글. 동시 클릭을 막으려 LOCK.UPDATE 를 쓰고, Comment.likeCount 를 같은 트랜잭션에서 증감한다. */
  async toggleLike(
    commentId: number,
    userId: string
  ): Promise<{ liked: boolean; likeCount: number }> {
    return sequelize.transaction(async t => {
      // soft-delete 된 댓글은 findByPk 에서 제외되어 404 가 된다.
      const comment = await Comment.findByPk(commentId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!comment) throw new AppError(404, '댓글을 찾을 수 없습니다.');

      const existing = await CommentLike.findOne({
        where: { CommentId: commentId, UserId: userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (existing) {
        await existing.destroy({ transaction: t });
        await comment.decrement('likeCount', { transaction: t });
      } else {
        await CommentLike.create({ CommentId: commentId, UserId: userId }, { transaction: t });
        await comment.increment('likeCount', { transaction: t });
      }

      // 응답에는 실제 행 수를 쓴다.
      const likeCount = await CommentLike.count({
        where: { CommentId: commentId },
        transaction: t,
      });

      return { liked: !existing, likeCount };
    });
  }
}

export const commentLikeService = new CommentLikeService();
