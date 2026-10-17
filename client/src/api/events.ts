import api from '../api/axios';
import { unwrap } from './utils';

export interface CreateEventParams {
  title: string;
  body?: string; // HTML content from CKEditor
  start: string | Date;
  end: string | Date;
  allDay?: boolean;
  isAllday?: boolean;
  calendarId?: string;
  category?: string;
  location?: string;
  isReadOnly?: boolean;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  description?: string;
  // ── 반복 ──────────────────────────────────────────────────────────────
  /** 'none' 이거나 넘기지 않으면 한 번짜리 일정 */
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** 반복을 켰으면 서버가 필수로 본다 */
  recurrenceEndDate?: string;
  /** 주간 반복의 요일(0=일 ~ 6=토). 서버가 주간에서 필수로 본다 */
  recurrenceDays?: number[];
}

export const createEvent = (event: CreateEventParams) => {
  return api.post('/events', event);
};

/** 반복 중 그 날 하루만 건너뛴다. 규칙은 그대로 두고 그 날짜만 빠진다. */
export const skipOccurrence = (id: number, date: string) =>
  api.delete(`/events/${id}/occurrences/${date}`).then(unwrap);

export const getEvents = (start: Date, end: Date) => {
  return api
    .get('/events', {
      params: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    })
    .then(unwrap);
};

export const updateEvent = (id: number | string, event: Partial<CreateEventParams>) => {
  return api.put(`/events/${id}`, event);
};

export const deleteEvent = (id: number | string) => {
  return api.delete(`/events/${id}`);
};
