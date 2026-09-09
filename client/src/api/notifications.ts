import api from './axios';
import { unwrap } from './utils';

export interface Notification {
  id: number;
  type: 'COMMENT' | 'LIKE' | 'MENTION' | 'SYSTEM';
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
