import { Op } from 'sequelize';
import { Notification, NotificationType } from '../models/Notification';
import { AppError } from '../middlewares/error.middleware';
import { invalidateCache } from '../utils/cache';

export class NotificationService {
  // 알림 생성 (내부 사용)
  async create(params: {
    userId: string;
    type: NotificationType;
    message: string;
    link?: string;
    relatedId?: string;
  }) {
    const notification = await Notification.create({
      userId: params.userId,
      type: params.type,
      message: params.message,
      link: params.link || null,
      relatedId: params.relatedId || null,
      isRead: false,
    });

    // 새 알림 생성 시 해당 사용자의 unread-count 캐시 무효화
    invalidateCache('notifications:unread', params.userId);

    return notification;
  }

  // 내 알림 목록 조회 (커서 기반)
  async getNotifications(userId: string, cursor?: number, limit: number = 20) {
    const where: Record<string, unknown> = { userId };
    if (cursor !== null && cursor !== undefined) {
      where['id'] = { [Op.lt]: cursor };
    }

    const [items, unreadCount] = await Promise.all([
      Notification.findAll({
        where,
        order: [['id', 'DESC']],
        limit: limit + 1,
      }),
      Notification.count({ where: { userId, isRead: false } }),
    ]);

    const hasMore = items.length > limit;
    const notifications = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? notifications[notifications.length - 1].id : null;

    return { notifications, unreadCount, nextCursor, hasMore };
  }

  // 안읽은 알림 수
  async getUnreadCount(userId: string): Promise<number> {
    return Notification.count({ where: { userId, isRead: false } });
  }

  // 특정 알림 읽음 처리 (1쿼리로 처리)
  async markAsRead(id: number, userId: string) {
    const [count] = await Notification.update({ isRead: true }, { where: { id, userId } });
    if (count === 0) throw new AppError(404, '알림을 찾을 수 없습니다.');
  }

  // 전체 읽음 처리
  async markAllAsRead(userId: string) {
    await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
  }

  // 알림 삭제 (1쿼리로 처리)
  async deleteNotification(id: number, userId: string) {
    const count = await Notification.destroy({ where: { id, userId } });
    if (count === 0) throw new AppError(404, '알림을 찾을 수 없습니다.');
  }

  // 내 알림 전체 삭제 — 삭제된 개수 반환 (0건이어도 에러 아님)
  async deleteAllNotifications(userId: string): Promise<number> {
    const count = await Notification.destroy({ where: { userId } });
    invalidateCache('notifications:unread', userId);
    return count;
  }
}

export const notificationService = new NotificationService();
