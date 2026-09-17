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
}

export const createEvent = (event: CreateEventParams) => {
  return api.post('/events', event);
};

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
