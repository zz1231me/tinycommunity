// server/src/services/subscription.service.ts
// 게시판 구독 / 사용자 팔로우, 그리고 새 글이 올라왔을 때의 알림 발송.
//
// 발송에서 가장 중요한 것은 "구독했다고 못 볼 글이 보이지는 않는다" 이다.
// 구독은 알림을 받겠다는 뜻이지 권한이 아니다. 그래서 대상마다 게시판 읽기
// 권한을 다시 확인하고, 비밀글은 아예 발송하지 않는다.

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

/**
 * 한 글로 알릴 수 있는 최대 인원.
 * 인기 게시판을 구독한 사람이 많을 때 글 하나 저장이 수백 건의 알림 쓰기로
 * 늘어나는 것을 막는다. 멘션(MAX_MENTIONS)과 같은 취지다.
 */
const MAX_SUBSCRIBER_NOTIFICATIONS = 200;

async function assertTargetExists(targetType: SubscriptionTargetType, targetId: string) {
  if (targetType === 'board') {
    const board = await Board.findByPk(targetId, { attributes: ['id', 'isActive', 'isPersonal'] });
    if (!board || !board.isActive) throw new AppError(404, '게시판을 찾을 수 없습니다.');
    // 개인 폴더는 소유자만 쓰는 공간이라 구독할 대상이 아니다
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
      // 연타로 두 요청이 동시에 만들려 들면 유니크 제약에 걸린다. 데이터는 안전하지만
      // 진 쪽이 500 으로 나가면 사용자는 실패한 줄 안다 — 이미 구독됐으니 그 상태를 돌려준다.
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

  /** 내 구독 목록 — 사라진 대상은 걸러 낸다 */
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

  /**
   * 새 글을 구독자에게 알린다.
   *
   * 저장 트랜잭션 바깥에서 부르고, 실패해도 글 작성은 되돌리지 않는다 —
   * 알림이 안 갔다고 이미 올라간 글을 무를 이유가 없다.
   */
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
      // 비밀글은 알리지 않는다. 제목만으로도 "누가 무엇에 대해 비밀글을 썼다" 가 새어 나간다.
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

      // 한 사람이 게시판과 작성자를 모두 구독했어도 알림은 하나다
      const userIds = [...new Set(targets.map(t => t.userId))].filter(id => id !== post.authorId);
      if (userIds.length === 0) return;

      const capped = userIds.slice(0, MAX_SUBSCRIBER_NOTIFICATIONS);

      // 권한 확인을 사람마다 하지 않는다.
      // 이 게시판을 읽을 수 있는 "역할" 과 "담당자" 를 각각 한 번씩 가져와
      // 메모리에서 거른다. 구독자 한 명마다 질의하면 글 하나 저장이
      // 수백 번의 왕복으로 번진다.
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

      // 구독은 알림을 받겠다는 뜻이지 권한이 아니다 — 지금도 읽을 수 있는 사람만 남긴다.
      // 게시판 담당자는 역할 권한이 없어도 읽을 수 있으므로 함께 본다.
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
      // 알림 발송 실패가 글 작성을 되돌리지 않는다
      logError('구독 알림 발송 실패', err, { postId: post.id });
    }
  },

  /** 프로필 화면용 — 이 사람이 쓴 글 수 (보는 사람이 읽을 수 있는 게시판만) */
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
