// 일정 하나를 수정 폼의 값으로 옮긴다.
//
// 반복 일정은 서버가 번째마다 한 벌씩 펼쳐 주고, 그 벌의 start 는 '그 날' 로 덮여 있다.
// 번째를 눌러 창을 열고 제목만 바꿔 저장해도 그 날짜가 규칙의 시작으로 올라갔다 —
// 31번 서던 일정이 12번으로 줄었다. 규칙을 고치는 창이니 규칙의 시작을 보여 줘야 한다.
// 서버는 번째마다 seriesStart·seriesEnd 를 함께 싣는다.

import { DEFAULT_EVENT_COLOR } from '../../../constants/colors';
import { dateUtils } from './utils';
import { CalendarEvent, EventFormData } from './types';

/** 이 벌이 가리키는 '규칙' 의 시작·끝 ISO. 보통 일정은 제 값 그대로다. */
export function seriesRange(ev: CalendarEvent): { start: string; end?: string | null } {
  if (ev.isRecurringOccurrence && ev.seriesStart) {
    return { start: ev.seriesStart, end: ev.seriesEnd };
  }
  return { start: ev.start, end: ev.end };
}

export function toFormData(ev: CalendarEvent): EventFormData {
  const range = seriesRange(ev);
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
  };
}
