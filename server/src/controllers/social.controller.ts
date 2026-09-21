// 구독·팔로우, 알림 설정, 다른 사람 프로필.

import { Response } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendServiceError } from '../utils/response';
import { Post } from '../models/Post';
import Board from '../models/Board';
import { Comment } from '../models/Comment';
import User from '../models/User';
import { Role } from '../models/Role';
import { subscriptionService } from '../services/subscription.service';
import { notificationSettingService } from '../services/notificationSetting.service';
import { getAccessibleBoardTypes } from '../services/accessibleBoards';
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_KEYS } from '../config/notificationKinds';
import type { SubscriptionTargetType } from '../models/Subscription';

/** 프로필에 보여 줄 최근 글 수 */
const RECENT_POST_LIMIT = 5;

function parseTarget(raw: unknown): SubscriptionTargetType | null {
  return raw === 'board' || raw === 'user' ? raw : null;
}

export const toggleSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  const targetType = parseTarget(req.params.targetType);
  const targetId = req.params.targetId;

  if (!targetType) {
    sendError(res, 400, '구독 대상은 board 또는 user 여야 합니다.');
    return;
  }

  try {
    sendSuccess(res, await subscriptionService.toggle(userId, targetType, targetId));
  } catch (err) {
    sendServiceError(res, err, '구독 처리에 실패했습니다.', { userId, targetType, targetId });
  }
};

export const getSubscriptionStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  const targetType = parseTarget(req.params.targetType);

  if (!targetType) {
    sendError(res, 400, '구독 대상은 board 또는 user 여야 합니다.');
    return;
  }

  try {
    const subscribed = await subscriptionService.isSubscribed(
      userId,
      targetType,
      req.params.targetId
    );
    sendSuccess(res, { subscribed });
  } catch (err) {
    sendServiceError(res, err, '구독 상태를 확인하지 못했습니다.', { userId });
  }
};

export const listSubscriptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    sendSuccess(res, await subscriptionService.list(userId));
  } catch (err) {
    sendServiceError(res, err, '구독 목록을 불러오지 못했습니다.', { userId });
  }
};

export const getNotificationSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    const state = await notificationSettingService.getFor(userId);
    sendSuccess(res, {
      kinds: NOTIFICATION_KIND_KEYS.map(key => ({
        key,
        label: NOTIFICATION_KINDS[key].label,
        description: NOTIFICATION_KINDS[key].description,
        configurable: NOTIFICATION_KINDS[key].configurable,
        enabled: state[key],
      })),
    });
  } catch (err) {
    sendServiceError(res, err, '알림 설정을 불러오지 못했습니다.', { userId });
  }
};

export const updateNotificationSettings = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id: userId } = req.user;
  const body = req.body as Record<string, unknown> | undefined;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendError(res, 400, '변경할 알림 종류를 지정해주세요.');
    return;
  }

  const changes: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'boolean') {
      sendError(res, 400, `'${key}' 값은 true/false 여야 합니다.`);
      return;
    }
    changes[key] = value;
  }
  if (Object.keys(changes).length === 0) {
    sendError(res, 400, '변경할 알림 종류를 지정해주세요.');
    return;
  }

  try {
    const { rejected } = await notificationSettingService.setMany(userId, changes);
    // 끌 수 없는 종류나 모르는 키를 조용히 버리면 사용자는 저장했다고 믿는다
    if (rejected.length > 0) {
      sendError(res, 400, `끌 수 없거나 알 수 없는 알림입니다: ${rejected.join(', ')}`);
      return;
    }
    sendSuccess(res, await notificationSettingService.getFor(userId));
  } catch (err) {
    sendServiceError(res, err, '알림 설정을 저장하지 못했습니다.', { userId });
  }
};

/** GET /api/users/:id/profile. 보는 사람이 읽을 수 있는 게시판의 공개 글만 센다. */
export const getUserProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: viewerId, role: viewerRole } = req.user;
  const targetId = req.params.id;

  try {
    const user = await User.findOne({
      where: { id: targetId, isActive: true, isDeleted: false },
      attributes: ['id', 'name', 'avatar', 'createdAt'],
      include: [{ model: Role, as: 'roleInfo', attributes: ['id', 'name'], required: false }],
    });
    if (!user) {
      sendError(res, 404, '사용자를 찾을 수 없습니다.');
      return;
    }

    const boardTypes = await getAccessibleBoardTypes(viewerId, viewerRole);

    const [postCount, commentCount, recentPosts, counts, isFollowing] = await Promise.all([
      subscriptionService.visiblePostCount(targetId, boardTypes),
      // 글 수와 같은 기준으로 센다. 전체를 세면 못 보는 게시판의 활동량이 새어 나간다.
      boardTypes.length
        ? Comment.count({
            where: { UserId: targetId },
            include: [
              {
                model: Post,
                as: 'post',
                required: true,
                attributes: [],
                where: {
                  boardType: { [Op.in]: boardTypes },
                  status: 'published',
                  isSecret: false,
                },
              },
            ],
          })
        : 0,
      boardTypes.length
        ? Post.findAll({
            where: {
              UserId: targetId,
              boardType: { [Op.in]: boardTypes },
              status: 'published',
              isSecret: false,
            },
            include: [{ model: Board, as: 'board', attributes: ['name'], required: false }],
            attributes: ['id', 'title', 'boardType', 'createdAt', 'viewCount'],
            order: [['createdAt', 'DESC']],
            limit: RECENT_POST_LIMIT,
          })
        : [],
      subscriptionService.counts(targetId),
      subscriptionService.isSubscribed(viewerId, 'user', targetId),
    ]);

    const plain = user.get({ plain: true }) as unknown as {
      id: string;
      name: string;
      avatar: string | null;
      createdAt: Date;
      roleInfo?: { id: string; name: string } | null;
    };

    sendSuccess(res, {
      id: plain.id,
      name: plain.name,
      avatar: plain.avatar ?? null,
      roleName: plain.roleInfo?.name ?? null,
      joinedAt: plain.createdAt,
      isSelf: plain.id === viewerId,
      isFollowing,
      followers: counts.followers,
      following: counts.following,
      postCount,
      commentCount,
      recentPosts: recentPosts.map(p => {
        const d = p.get({ plain: true }) as unknown as {
          id: string;
          title: string;
          boardType: string;
          createdAt: Date;
          viewCount: number | null;
          board?: { name: string } | null;
        };
        return {
          id: d.id,
          title: d.title,
          boardType: d.boardType,
          boardName: d.board?.name ?? d.boardType,
          viewCount: d.viewCount ?? 0,
          createdAt: d.createdAt,
        };
      }),
    });
  } catch (err) {
    sendServiceError(res, err, '프로필을 불러오지 못했습니다.', { viewerId, targetId });
  }
};
