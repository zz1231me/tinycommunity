// 일정 하나를 수정 폼의 값으로 옮긴다.
//
// 반복 일정은 서버가 번째마다 한 벌씩 펼쳐 주고, 그 벌의 start 는 '그 날' 로 덮여 있다.
// 번째를 눌러 창을 열고 제목만 바꿔 저장해도 그 날짜가 규칙의 시작으로 올라갔다 —
// 31번 서던 일정이 12번으로 줄었다. 규칙을 고치는 창이니 규칙의 시작을 보여 줘야 한다.
// 서버는 번째마다 seriesStart·seriesEnd 를 함께 싣는다.

import { DEFAULT_EVENT_COLOR } from '../../../constants/colors';
import { dateUtils } from './utils';
import { CalendarEvent, EventFormData } from './types';

/** 고치는 대상. 'all' 은 반복 규칙 전체, 'one' 은 그 날 하루만. */
export type EditScope = 'all' | 'one';

/**
 * 이 벌이 가리키는 날짜. 'all' 이면 규칙의 시작, 'one' 이면 눌린 그 날이다.
 * 보통 일정은 둘이 같다.
 */
export function rangeFor(
  ev: CalendarEvent,
  scope: EditScope = 'all'
): { start: string; end?: string | null } {
  if (scope === 'all' && ev.isRecurringOccurrence && ev.seriesStart) {
    return { start: ev.seriesStart, end: ev.seriesEnd };
  }
  return { start: ev.start, end: ev.end };
}

export function toFormData(ev: CalendarEvent, scope: EditScope = 'all'): EventFormData {
  const range = rangeFor(ev, scope);
  const start = dateUtils.isoToLocalDate(range.start);
  const end = range.end ? dateUtils.subtractDay(dateUtils.isoToLocalDate(range.end)) : start;

  return {
    title: ev.title,
    body: ev.body || '',
    isAllday: ev.isAllday,
    start,
    end,
    category: ev.category || 'meeting',
    location: ev.location || '',
    color: ev.backgroundColor || DEFAULT_EVENT_COLOR,
    backgroundColor: ev.backgroundColor || DEFAULT_EVENT_COLOR,
    // 반복 규칙도 함께 채운다. 비워 두면 매일 도는 일정이 수정 창에서 '반복 안 함'
    // 으로 보였고, 거기서 매주로 바꿔 저장해도 아무 일도 일어나지 않았다.
    recurrenceType: ev.recurrenceType ?? 'none',
    ...(ev.recurrenceEndDate
      ? { recurrenceEndDate: dateUtils.isoToLocalDate(ev.recurrenceEndDate) }
      : {}),
    ...(ev.recurrenceDays?.length ? { recurrenceDays: ev.recurrenceDays } : {}),
  };
}
