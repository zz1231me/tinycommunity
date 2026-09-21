// 게시판 구독·사용자 팔로우와 새 글 알림. 구독은 권한이 아니므로 발송 전에 읽기 권한을 다시 본다.

import { Op, UniqueConstraintError } from 'sequelize';
import { Subscription, type SubscriptionTargetType } from '../models/Subscription';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { BoardManager } from '../models/BoardManager';
import User from '../models/User';
import { Role } from '../models/Role';
import { Post } from '../models/Post';
import { AppError } from '../middlewares/error.middleware';
import { notificationService } from './notification.service';
import { featureFlagService } from './featureFlag.service';
import { logError } from '../utils/logger';

/** 한 글로 알릴 수 있는 최대 인원 */
const MAX_SUBSCRIBER_NOTIFICATIONS = 200;

async function assertTargetExists(targetType: SubscriptionTargetType, targetId: string) {
  if (targetType === 'board') {
    const board = await Board.findByPk(targetId, { attributes: ['id', 'isActive', 'isPersonal'] });
    if (!board || !board.isActive) throw new AppError(404, '게시판을 찾을 수 없습니다.');
    // 개인 폴더는 소유자만 쓰는 공간이라 구독 대상이 아니다.
    if (board.isPersonal) throw new AppError(400, '개인 공간은 구독할 수 없습니다.');
    return;
  }
  const user = await User.findByPk(targetId, { attributes: ['id', 'isActive', 'isDeleted'] });
  if (!user || !user.isActive || user.isDeleted) {
    throw new AppError(404, '사용자를 찾을 수 없습니다.');
  }
}

export const subscriptionService = {
  /** 구독 토글. 돌려주는 값은 토글 이후 상태다. */
  async toggle(
    userId: string,
    targetType: SubscriptionTargetType,
    targetId: string
  ): Promise<{ subscribed: boolean }> {
    if (targetType === 'user' && targetId === userId) {
      throw new AppError(400, '자기 자신은 팔로우할 수 없습니다.');
    }
    await assertTargetExists(targetType, targetId);

    const existing = await Subscription.findOne({ where: { userId, targetType, targetId } });
    if (existing) {
      await existing.destroy();
      return { subscribed: false };
    }
    try {
      await Subscription.create({ userId, targetType, targetId });
    } catch (err) {
      // 동시 요청이 유니크 제약에 걸린 경우는 이미 구독된 것으로 본다.
      if (!(err instanceof UniqueConstraintError)) throw err;
    }
    return { subscribed: true };
  },

  async isSubscribed(
    userId: string,
    targetType: SubscriptionTargetType,
    targetId: string
  ): Promise<boolean> {
    const found = await Subscription.findOne({
      where: { userId, targetType, targetId },
      attributes: ['id'],
    });
    return !!found;
  },

  /** 내 구독 목록. 사라진 대상은 걸러 낸다. */
  async list(userId: string) {
    const rows = await Subscription.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 200,
    });

    const boardIds = rows.filter(r => r.targetType === 'board').map(r => r.targetId);
    const userIds = rows.filter(r => r.targetType === 'user').map(r => r.targetId);

    const [boards, users] = await Promise.all([
      boardIds.length
        ? Board.findAll({ where: { id: boardIds, isActive: true }, attributes: ['id', 'name'] })
        : [],
      userIds.length
        ? User.findAll({
            where: { id: userIds, isActive: true, isDeleted: false },
            attributes: ['id', 'name', 'avatar'],
          })
        : [],
    ]);

    const boardName = new Map(boards.map(b => [b.id, b.name]));
    const userInfo = new Map(users.map(u => [u.id, u]));

    return rows
      .map(row => {
        if (row.targetType === 'board') {
          const name = boardName.get(row.targetId);
          return name
            ? {
                targetType: 'board' as const,
                targetId: row.targetId,
                name,
                avatar: null,
                createdAt: row.createdAt,
              }
            : null;
        }
        const user = userInfo.get(row.targetId);
        return user
          ? {
              targetType: 'user' as const,
              targetId: row.targetId,
              name: user.name,
              avatar: user.avatar ?? null,
              createdAt: row.createdAt,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  },

  /** 이 사용자를 팔로우하는 사람 수 / 이 사용자가 팔로우하는 사람 수 */
  async counts(userId: string): Promise<{ followers: number; following: number }> {
    const [followers, following] = await Promise.all([
      Subscription.count({ where: { targetType: 'user', targetId: userId } }),
      Subscription.count({ where: { userId, targetType: 'user' } }),
    ]);
    return { followers, following };
  },

  /** 새 글을 구독자에게 알린다. 저장 트랜잭션 바깥에서 부르고 실패해도 글 작성은 유지된다. */
  async notifyNewPost(post: {
    id: string;
    title: string;
    boardType: string;
    authorId: string | null;
    authorName: string;
    isSecret: boolean;
  }): Promise<void> {
    try {
      if (!(await featureFlagService.isEnabled('social.subscriptions'))) return;
      // 비밀글은 제목만으로도 내용이 새므로 알리지 않는다.
      if (post.isSecret) return;

      const targets = await Subscription.findAll({
        where: {
          [Op.or]: [
            { targetType: 'board', targetId: post.boardType },
            ...(post.authorId ? [{ targetType: 'user', targetId: post.authorId }] : []),
          ],
        },
        attributes: ['userId'],
      });

      // 게시판과 작성자를 모두 구독했어도 알림은 하나다.
      const userIds = [...new Set(targets.map(t => t.userId))].filter(id => id !== post.authorId);
      if (userIds.length === 0) return;

      const capped = userIds.slice(0, MAX_SUBSCRIBER_NOTIFICATIONS);

      // 역할과 담당자를 한 번씩만 가져와 메모리에서 거른다. 사람마다 질의하면 왕복이 폭증한다.
      const [users, readableRoles, managers] = await Promise.all([
        User.findAll({
          where: { id: { [Op.in]: capped }, isActive: true, isDeleted: false },
          attributes: ['id'],
          include: [{ model: Role, as: 'roleInfo', attributes: ['id'] }],
        }),
        BoardAccess.findAll({
          where: { boardId: post.boardType, canRead: true },
          attributes: ['roleId'],
        }),
        BoardManager.findAll({
          where: { boardId: post.boardType, userId: { [Op.in]: capped } },
          attributes: ['userId'],
        }),
      ]);

      const roleCanRead = new Set(readableRoles.map(r => r.roleId));
      const isManager = new Set(managers.map(m => m.userId));

      // 지금도 읽을 수 있는 사람만 남긴다. 담당자는 역할 권한이 없어도 읽을 수 있다.
      const recipients = users
        .filter(user => {
          const roleId = (user as unknown as { roleInfo?: { id: string } }).roleInfo?.id;
          return !!roleId && (roleCanRead.has(roleId) || isManager.has(user.id));
        })
        .map(user => user.id);

      await notificationService.createManyForUsers({
        userIds: recipients,
        type: 'SUBSCRIPTION',
        message: `${post.authorName}님이 새 글을 올렸습니다: ${post.title}`,
        link: `/dashboard/posts/${post.boardType}/${post.id}`,
        relatedId: post.id,
      });
    } catch (err) {
      logError('구독 알림 발송 실패', err, { postId: post.id });
    }
  },

  /** 이 사람이 쓴 글 수. 보는 사람이 읽을 수 있는 게시판만 센다. */
  async visiblePostCount(authorId: string, boardTypes: string[]): Promise<number> {
    if (boardTypes.length === 0) return 0;
    return Post.count({
      where: {
        UserId: authorId,
        boardType: { [Op.in]: boardTypes },
        status: 'published',
        isSecret: false,
      },
    });
  },
};
