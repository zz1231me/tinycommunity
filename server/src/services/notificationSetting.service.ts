// server/src/services/notificationSetting.service.ts
// 사용자별 알림 종류 on/off.
//
// 판정을 notification.service.create() 한 곳에서만 하도록 설계했다.
// 알림을 만드는 경로가 여러 곳(댓글·좋아요·멘션·구독)인데 각자 확인하게 두면
// 한 곳만 빠뜨려도 "껐는데 계속 오는" 알림이 생긴다.

import { Op } from 'sequelize';
import { NotificationSetting } from '../models/NotificationSetting';
import {
  isConfigurable,
  isNotificationKind,
  resolveNotificationSettings,
  type NotificationKind,
} from '../config/notificationKinds';
import { logError } from '../utils/logger';

export const notificationSettingService = {
  /** 저장값 + 기본값을 합친 완전한 상태 */
  async getFor(userId: string): Promise<Record<NotificationKind, boolean>> {
    const rows = await NotificationSetting.findAll({ where: { userId } });
    const stored: Partial<Record<NotificationKind, boolean>> = {};
    for (const row of rows) {
      // 카탈로그에서 사라진 종류의 행은 무시한다
      if (isNotificationKind(row.type)) stored[row.type] = row.enabled;
    }
    return resolveNotificationSettings(stored);
  },

  /**
   * 이 종류의 알림을 보내도 되는지.
   * 설정을 못 읽으면 보낸다 — 알림이 안 오는 것보다 오는 쪽이 덜 나쁘다.
   */
  async isEnabled(userId: string, kind: NotificationKind): Promise<boolean> {
    if (!isConfigurable(kind)) return true;
    try {
      const row = await NotificationSetting.findOne({ where: { userId, type: kind } });
      if (!row) return true; // 저장값이 없으면 기본값(켜짐)
      return row.enabled;
    } catch (err) {
      logError('알림 설정 조회 실패 — 알림을 보냅니다', err, { userId, kind });
      return true;
    }
  },

  /**
   * 여러 사람이 이 종류의 알림을 받는지 한 번에 확인한다.
   *
   * 사람마다 isEnabled 를 부르면 구독자 수만큼 질의가 늘어난다 —
   * 인기 게시판에 글 하나 올릴 때 수백 번 왕복하던 자리다.
   */
  async filterEnabled(userIds: string[], kind: NotificationKind): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    // 끌 수 없는 종류는 저장값을 볼 필요도 없다
    if (!isConfigurable(kind)) return new Set(userIds);

    try {
      const rows = await NotificationSetting.findAll({
        where: { userId: { [Op.in]: userIds }, type: kind },
        attributes: ['userId', 'enabled'],
      });
      const disabled = new Set(rows.filter(r => !r.enabled).map(r => r.userId));
      // 저장값이 없는 사람은 기본값(켜짐)이다
      return new Set(userIds.filter(id => !disabled.has(id)));
    } catch (err) {
      // 설정을 못 읽으면 보낸다 — 알림이 안 오는 것보다 오는 쪽이 덜 나쁘다
      logError('알림 설정 일괄 조회 실패 — 모두에게 보냅니다', err, { kind });
      return new Set(userIds);
    }
  },

  /** 여러 종류를 한 번에 저장한다. 끌 수 없는 종류는 조용히 버리지 않고 거른 뒤 알린다. */
  async setMany(
    userId: string,
    changes: Record<string, boolean>
  ): Promise<{ applied: NotificationKind[]; rejected: string[] }> {
    const applied: NotificationKind[] = [];
    const rejected: string[] = [];
    const valid: NotificationKind[] = [];

    // 먼저 전부 확인하고, 하나라도 걸리면 아무것도 바꾸지 않는다.
    //
    // 하나씩 저장하며 걸러 내면 절반만 반영된 채 컨트롤러가 400 을 돌려준다.
    // 사용자는 저장이 안 된 줄 알지만 실제로는 일부가 바뀌어 있어서, 끈 적 없는
    // 알림이 꺼진 상태로 남는다 — 알림이 안 온다는 사실 자체를 모르게 된다.
    for (const key of Object.keys(changes)) {
      if (isNotificationKind(key) && isConfigurable(key)) valid.push(key);
      else rejected.push(key);
    }
    if (rejected.length > 0) return { applied, rejected };

    for (const key of valid) {
      await NotificationSetting.upsert({ userId, type: key, enabled: !!changes[key] });
      applied.push(key);
    }

    return { applied, rejected };
  },
};
