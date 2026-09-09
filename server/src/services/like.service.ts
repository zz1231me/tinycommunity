import { Post } from '../models/Post';
import { PostLike } from '../models/PostLike';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { BaseService } from './base.service';

export class LikeService extends BaseService {
  // 좋아요 토글 (없으면 추가, 있으면 제거) - 트랜잭션으로 race condition 방지
  async toggleLike(postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const { liked, likeCount } = await sequelize.transaction(async t => {
      // 트랜잭션 내에서 게시글 존재 확인 (TOCTOU 방지)
      const post = await Post.findByPk(postId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');

      const existing = await PostLike.findOne({
        where: { PostId: postId, UserId: userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (existing) {
        await existing.destroy({ transaction: t });
      } else {
        await PostLike.create({ PostId: postId, UserId: userId }, { transaction: t });
      }

      const count = await PostLike.count({ where: { PostId: postId }, transaction: t });
      return { liked: !existing, likeCount: count };
    });

    return { liked, likeCount };
  }

  // 특정 게시글 좋아요 수 + 현재 사용자 좋아요 여부
  async getLikeStatus(
    postId: string,
    userId: string
  ): Promise<{ liked: boolean; likeCount: number }> {
    const [likeCount, userLike] = await Promise.all([
      PostLike.count({ where: { PostId: postId } }),
      PostLike.findOne({ where: { PostId: postId, UserId: userId } }),
    ]);
    return { liked: !!userLike, likeCount };
  }
}

export const likeService = new LikeService();
