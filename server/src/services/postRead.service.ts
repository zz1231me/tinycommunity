import { PostRead } from '../models/PostRead';
import { Post } from '../models/Post';
import { AppError } from '../middlewares/error.middleware';
import { BaseService } from './base.service';
import { Op } from 'sequelize';
import User from '../models/User';
import { getBoardAudienceWhere } from './boardAudience';
import { checkSecretPostAccess } from '../utils/postAccess';

export class PostReadService extends BaseService {
  async markRead(
    postId: string,
    userId: string,
    boardType?: string,
    userRole?: string
  ): Promise<void> {
    // 존재하지 않거나 URL의 게시판과 다른 게시글에 대한 읽음 레코드 생성 방지
    const post = await Post.findByPk(postId, {
      attributes: ['id', 'boardType', 'isSecret', 'secretType', 'secretUserIds', 'UserId'],
    });
    if (!post || (boardType && post.boardType !== boardType)) {
      throw new AppError(404, '게시글을 찾을 수 없습니다.');
    }

    // 열 수 없는 글에는 읽음 기록을 남기지 않는다.
    const access = checkSecretPostAccess(post, userId, userRole);
    if (!access.ok) throw new AppError(403, access.message);

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

  /** 읽은 사람과 읽어야 할 사람. 대상은 게시판을 읽을 수 있는 활성 사용자이며 작성자는 제외한다. */
  async getReaders(postId: string) {
    const post = await Post.findByPk(postId, {
      attributes: ['id', 'boardType', 'UserId', 'isSecret', 'secretType', 'secretUserIds'],
    });
    if (!post) throw new AppError(404, '게시글을 찾을 수 없습니다.');

    const [readRows, audienceWhere] = await Promise.all([
      PostRead.findAll({
        where: { PostId: postId },
        attributes: ['UserId', 'readAt'],
        order: [['readAt', 'DESC']],
      }),
      getBoardAudienceWhere(post.boardType),
    ]);

    const audience = audienceWhere
      ? await User.findAll({
          where: { isActive: true, isDeleted: false, ...audienceWhere },
          attributes: ['id', 'name', 'avatar'],
        })
      : [];

    let expected = audience.filter(u => u.id !== post.UserId);

    // 비밀글은 대상도 함께 좁힌다. 비밀번호 잠금 글은 작성자 외에 열 수 없어 대상이 비어야 맞다.
    if (post.isSecret) {
      const allowed = post.secretType === 'users' ? (post.secretUserIds ?? []) : [];
      expected = expected.filter(u => allowed.includes(u.id));
    }
    const readAtByUser = new Map(readRows.map(r => [r.UserId as string, r.readAt]));

    const readers = expected
      .filter(u => readAtByUser.has(u.id))
      .map(u => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar ?? null,
        readAt: readAtByUser.get(u.id),
      }))
      .sort((a, b) => new Date(b.readAt as Date).getTime() - new Date(a.readAt as Date).getTime());

    const unread = expected
      .filter(u => !readAtByUser.has(u.id))
      .map(u => ({ id: u.id, name: u.name, avatar: u.avatar ?? null }));

    return { total: expected.length, readCount: readers.length, readers, unread };
  }

  async isRead(postId: string, userId: string): Promise<boolean> {
    const read = await PostRead.findOne({ where: { PostId: postId, UserId: userId } });
    return !!read;
  }
}

export const postReadService = new PostReadService();
