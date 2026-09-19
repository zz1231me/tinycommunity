import { Op } from 'sequelize';
import { Notification, NotificationType } from '../models/Notification';
import { AppError } from '../middlewares/error.middleware';
import { invalidateCache } from '../utils/cache';
import { pushToUser } from './sse.service';
import { notificationSettingService } from './notificationSetting.service';

export class NotificationService {
  /**
   * 알림 생성 (내부 사용).
   *
   * 사용자가 끈 종류인지 여기서 한 번만 확인한다. 알림을 만드는 경로가
   * 여러 곳인데 각자 확인하게 두면 한 곳만 빠뜨려도 "껐는데 계속 오는" 알림이 생긴다.
   * 꺼져 있으면 만들지 않고 null 을 돌려준다 — 호출부는 대개 결과를 쓰지 않는다.
   */
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

    // 새 알림 생성 시 해당 사용자의 unread-count 캐시 무효화
    invalidateCache('notifications:unread', params.userId);

    // 열려 있는 SSE 연결로 즉시 전달. 연결이 없으면 아무 일도 하지 않고,
    // 클라이언트는 폴링 폴백으로 다음 주기에 받아간다.
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
   * 여러 사람에게 같은 알림을 한 번에 만든다.
   *
   * create() 를 사람 수만큼 부르면 설정 조회 1번 + INSERT 1번이 사람마다 늘어난다.
   * 구독 알림처럼 수백 명에게 나가는 자리에서는 그것만으로 수백 번을 왕복한다.
   * 설정 판정은 여전히 이 서비스 안에서 한 번에 처리하므로,
   * "껐는데 오는 알림" 을 막는 성질은 그대로다.
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
      // 연결이 없는 사용자는 아무 일도 일어나지 않고 폴링으로 받아간다
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

  /**
   * 이 사람이 열어 둔 다른 화면들에 지금 안 읽은 수를 알린다.
   *
   * 읽음·삭제는 지금까지 아무것도 밀지 않아, 한 탭에서 '모두 읽음' 을 눌러도 다른 탭·다른
   * 기기의 종 숫자는 그대로였다. 스트림이 붙어 있는 동안 폴링은 5분에 한 번이라 그만큼 오래
   * 어긋났고, 그 사이 새 알림이 오면 틀린 숫자 위에 1 을 더해 틀린 채로 굴러갔다.
   *
   * 실패해도 하던 일은 그대로다 — 숫자는 다음 폴링이 맞춘다.
   */
  private async pushUnreadCount(userId: string): Promise<void> {
    try {
      pushToUser(userId, 'unread-count', { count: await this.getUnreadCount(userId) });
    } catch {
      /* 숫자 알리기 실패는 조용히 넘긴다 */
    }
  }

  // 특정 알림 읽음 처리 (1쿼리로 처리)
  async markAsRead(id: number, userId: string) {
    const [count] = await Notification.update({ isRead: true }, { where: { id, userId } });
    if (count === 0) throw new AppError(404, '알림을 찾을 수 없습니다.');
    await this.pushUnreadCount(userId);
  }

  // 전체 읽음 처리
  async markAllAsRead(userId: string) {
    await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
    await this.pushUnreadCount(userId);
  }

  // 알림 삭제 (1쿼리로 처리)
  async deleteNotification(id: number, userId: string) {
    const count = await Notification.destroy({ where: { id, userId } });
    if (count === 0) throw new AppError(404, '알림을 찾을 수 없습니다.');
    await this.pushUnreadCount(userId);
  }

  // 내 알림 전체 삭제 — 삭제된 개수 반환 (0건이어도 에러 아님)
  /**
   * 보관 기간이 지난 알림을 지운다. 서버가 하루 한 번 부른다.
   *
   * 알림은 댓글·좋아요·멘션·구독 전파·메시지마다 한 줄씩 쌓이는데(구독 전파는 구독자
   * 수만큼), 지우는 길이 사용자가 직접 누르는 것밖에 없었다. 보안·에러·로그인·감사
   * 로그는 모두 보관 기간이 있는데 알림만 빠져 있어서, 오래 돌린 설치에서는 끝없이
   * 늘어나고 안 읽은 수 세기와 목록 조회가 함께 느려진다.
   */
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
