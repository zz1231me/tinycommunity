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
  /** 게시판 일정이면 그 게시판 id. 비어 있으면 전사 공유 일정이다. */
  boardId?: string | null;
  user?: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  // ── 반복 ──────────────────────────────────────────────────────────────
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval?: number;
  recurrenceDays?: number[] | null;
  recurrenceEndDate?: string | null;
  /** 서버가 펼쳐서 준 '이 번째' 의 날짜(YYYY-MM-DD). 하루만 건너뛸 때 집는 열쇠다. */
  occurrenceDate?: string;
  /** 규칙에서 펼쳐진 것인지. 원본 한 줄과 구분한다. */
  isRecurringOccurrence?: boolean;
  /** 번째가 아니라 규칙 자체의 시작·끝. 수정 창은 이 값으로 채운다. */
  seriesStart?: string;
  seriesEnd?: string;
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
  /** 'none' 이면 한 번짜리 일정 */
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** 반복을 켰을 때만 쓴다(YYYY-MM-DD). 서버가 필수로 본다. */
  recurrenceEndDate?: string;
  /** 주간 반복의 요일(0=일 ~ 6=토) */
  recurrenceDays?: number[];
}

export type ModalMode = 'view' | 'create' | 'edit';

// 글자색은 담아 두지 않는다. 바탕색에서 계산하는 값이라(useEventCategories 의 readableText)
// 따로 들고 다니면 색만 바뀌었을 때 둘이 어긋난다.
export interface Category {
  key: string;
  emoji: string;
  label: string;
  bg: string;
  border: string;
}

export interface CategoryColor {
  bg: string;
  border: string;
  label: string;
}
