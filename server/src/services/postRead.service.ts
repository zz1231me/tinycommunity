import { PostRead } from '../models/PostRead';
import { Post } from '../models/Post';
import { AppError } from '../middlewares/error.middleware';
import { BaseService } from './base.service';
import { Op } from 'sequelize';

export class PostReadService extends BaseService {
  async markRead(postId: string, userId: string, boardType?: string): Promise<void> {
    // 존재하지 않거나 URL의 게시판과 다른 게시글에 대한 읽음 레코드 생성 방지
    const post = await Post.findByPk(postId, { attributes: ['id', 'boardType'] });
    if (!post || (boardType && post.boardType !== boardType)) {
      throw new AppError(404, '게시글을 찾을 수 없습니다.');
    }
    await PostRead.upsert({ PostId: postId, UserId: userId, readAt: new Date() });
  }

  async getReadPostIds(postIds: string[], userId: string): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    const reads = await PostRead.findAll({
      where: { PostId: { [Op.in]: postIds }, UserId: userId },
      attributes: ['PostId'],
    });
    return new Set(reads.map(r => r.PostId as string));
  }

  async isRead(postId: string, userId: string): Promise<boolean> {
    const read = await PostRead.findOne({ where: { PostId: postId, UserId: userId } });
    return !!read;
  }
}

export const postReadService = new PostReadService();
