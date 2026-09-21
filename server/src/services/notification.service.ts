import { Op } from 'sequelize';
import { Notification, NotificationType } from '../models/Notification';
import { AppError } from '../middlewares/error.middleware';
import { invalidateCache } from '../utils/cache';
import { pushToUser } from './sse.service';
import { notificationSettingService } from './notificationSetting.service';

export class NotificationService {
  /** 알림 생성. 사용자가 끈 종류면 만들지 않고 null 을 돌려준다. */
  async create(params: {
    userId: string;
    type: NotificationType;
    message: string;
    link?: string;
    relatedId?: string;
  }) {
    if (!(await notificationSettingService.isEnabled(params.userId, params.type))) {
      return null;
    }

    const notification = await Notification.create({
      userId: params.userId,
      type: params.type,
      message: params.message,
      link: params.link || null,
      relatedId: params.relatedId || null,
      isRead: false,
    });

    invalidateCache('notifications:unread', params.userId);

    // 열려 있는 SSE 연결로 즉시 전달. 연결이 없으면 클라이언트가 폴링으로 받아간다.
    pushToUser(params.userId, 'notification', {
      id: notification.id,
      type: notification.type,
      message: notification.message,
      link: notification.link,
      relatedId: notification.relatedId,
      isRead: false,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  /**
   * 여러 사람에게 같은 알림을 한 번에 만든다. 설정 판정과 INSERT 를 각각 한 번으로 묶는다.
   *
   * @returns 실제로 만들어진 알림 수
   */
  async createManyForUsers(params: {
    userIds: string[];
    type: NotificationType;
    message: string;
    link?: string;
    relatedId?: string;
  }): Promise<number> {
    const targets = [...new Set(params.userIds)];
    if (targets.length === 0) return 0;

    const allowed = await notificationSettingService.filterEnabled(targets, params.type);
    const recipients = targets.filter(id => allowed.has(id));
    if (recipients.length === 0) return 0;

    const rows = await Notification.bulkCreate(
      recipients.map(userId => ({
        userId,
        type: params.type,
        message: params.message,
        link: params.link || null,
        relatedId: params.relatedId || null,
        isRead: false,
      }))
    );

    for (const row of rows) {
      invalidateCache('notifications:unread', row.userId);
      // 연결이 없는 사용자는 폴링으로 받아간다
      pushToUser(row.userId, 'notification', {
        id: row.id,
        type: row.type,
        message: row.message,
        link: row.link,
        relatedId: row.relatedId,
        isRead: false,
        createdAt: row.createdAt,
      });
    }

    return rows.length;
  }

  // 커서 기반 목록 조회
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

  async getUnreadCount(userId: string): Promise<number> {
    return Notification.count({ where: { userId, isRead: false } });
  }

  /**
   * 열려 있는 다른 화면들에 지금 안 읽은 수를 알린다. 실패해도 넘어간다.
   *
   * @returns 센 값. 호출부가 응답에도 실어 클라이언트가 직접 깎지 않게 한다.
   */
  private async pushUnreadCount(userId: string): Promise<number> {
    const count = await this.getUnreadCount(userId);
    try {
      pushToUser(userId, 'unread-count', { count });
    } catch {
      /* 실패는 무시한다 */
    }
    return count;
  }

  /** 알림 하나를 읽음 처리하고 남은 안 읽은 수를 돌려준다. */
  async markAsRead(id: number, userId: string): Promise<number> {
    const [count] = await Notification.update({ isRead: true }, { where: { id, userId } });
    if (count === 0) throw new AppError(404, '알림을 찾을 수 없습니다.');
    return this.pushUnreadCount(userId);
  }

  async markAllAsRead(userId: string): Promise<number> {
    await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
    return this.pushUnreadCount(userId);
  }

  /** 알림 하나를 지우고 남은 안 읽은 수를 돌려준다. */
  async deleteNotification(id: number, userId: string): Promise<number> {
    const count = await Notification.destroy({ where: { id, userId } });
    if (count === 0) throw new AppError(404, '알림을 찾을 수 없습니다.');
    return this.pushUnreadCount(userId);
  }

  /** 보관 기간이 지난 알림을 지운다. 서버가 하루 한 번 부른다. */
  async deleteOldNotifications(retentionDays = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    return Notification.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
  }

  async deleteAllNotifications(userId: string): Promise<number> {
    const count = await Notification.destroy({ where: { userId } });
    invalidateCache('notifications:unread', userId);
    await this.pushUnreadCount(userId);
    return count;
  }
}

export const notificationService = new NotificationService();
