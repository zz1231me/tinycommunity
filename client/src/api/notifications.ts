import api from './axios';
import { unwrap } from './utils';

export interface Notification {
  id: number;
  // 서버 카탈로그(config/notificationKinds.ts)와 같은 값을 쓴다.
  // 여기가 좁으면 새 종류가 와도 타입은 모르는 채로 지나간다 — 실제로 SUBSCRIPTION·
  // ASSIGNMENT·MESSAGE 가 빠진 채였다.
  type:
    | 'COMMENT'
    | 'LIKE'
    | 'MENTION'
    | 'SUBSCRIPTION'
    | 'ASSIGNMENT'
    | 'MESSAGE'
    | 'DUEL'
    | 'ATTACK'
    | 'SYSTEM';
  message: string;
  link: string | null;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
}

export const getNotifications = (cursor?: number, limit = 20) =>
  api.get('/notifications', { params: { cursor, limit } }).then(unwrap);

export const markAsRead = (id: number) => api.put(`/notifications/${id}/read`).then(unwrap);

export const markAllAsRead = () => api.put('/notifications/read-all').then(unwrap);

export const deleteNotification = (id: number) => api.delete(`/notifications/${id}`).then(unwrap);

export const deleteAllNotifications = () => api.delete('/notifications').then(unwrap);
