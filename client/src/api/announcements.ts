// client/src/api/announcements.ts
import api from './axios';
import { unwrap } from './utils';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  startAt: string;
  endAt: string | null;
  isActive: boolean;
  isPinned: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnnouncementInput {
  title: string;
  content: string;
  startAt: string; // ISO
  endAt: string | null;
  isActive: boolean;
  isPinned: boolean;
}

// 사용자 — 현재 게시 중
export const fetchActiveAnnouncements = (): Promise<Announcement[]> =>
  api.get('/announcements').then(unwrap);

// 관리자
export const fetchAllAnnouncements = (): Promise<Announcement[]> =>
  api.get('/announcements/admin').then(unwrap);

export const createAnnouncement = (data: AnnouncementInput): Promise<Announcement> =>
  api.post('/announcements', data).then(unwrap);

export const updateAnnouncement = (id: string, data: AnnouncementInput): Promise<Announcement> =>
  api.put(`/announcements/${id}`, data).then(unwrap);

export const deleteAnnouncement = (id: string): Promise<void> =>
  api.delete(`/announcements/${id}`).then(() => undefined);
