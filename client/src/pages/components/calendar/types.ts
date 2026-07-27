// client/src/pages/components/calendar/types.ts
export interface CalendarEvent {
  id: number;
  calendarId: string;
  title: string;
  body?: string;
  isAllday: boolean;
  start: string;
  end: string;
  category?: string;
  location?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attendees?: any;
  state?: string;
  isReadOnly: boolean;
  color?: string;
  backgroundColor?: string;
  dragBackgroundColor?: string;
  borderColor?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customStyle?: any;
  UserId: string;
  user?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EventFormData {
  title: string;
  body: string;
  isAllday: boolean;
  start: string;
  end: string;
  category: string;
  location?: string;
  color: string;
  backgroundColor: string;
}

export type ModalMode = 'view' | 'create' | 'edit';

export interface Category {
  key: string;
  emoji: string;
  label: string;
  bg: string;
  border: string;
  textColor: string;
}

export interface CategoryColor {
  bg: string;
  border: string;
  label: string;
  textColor: string;
}
