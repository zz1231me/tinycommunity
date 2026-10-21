import { useState, useCallback, useRef } from 'react';
import { EventInput } from '@fullcalendar/core';
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  editOccurrence,
} from '../../../../api/events';
import { CalendarEvent, EventFormData } from '../types';
import { categoryColors } from '../constants';
import { dateUtils } from '../utils';
import { toast } from '../../../../utils/toast';
import { DEFAULT_EVENT_COLOR } from '../../../../constants/colors';

/** 레일('오늘'·'다가오는 일정')이 보는 날수. */
export const RAIL_DAYS = 31;
/**
 * 보이는 달과 레일 창을 한 번에 받는 최대 폭(일).
 * 먼 달을 보는 중이면 합친 범위가 몇 달로 벌어지므로 그때는 둘로 나눠 받는다 —
 * 요청 하나를 줄이려고 몇 달치를 끌어오면 바꾼 보람이 없다.
 */
const MAX_MERGED_DAYS = 100;
const DAY_MS = 86_400_000;

/** 레일이 보는 구간 [오늘 0시, +RAIL_DAYS). 보이는 달과 무관하게 오늘 기준이다. */
export function railWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + RAIL_DAYS);
  return { start, end };
}

/**
 * 두 범위를 겹쳐 받았을 때 같은 일정이 두 번 들어오는 것을 걷는다.
 * 반복 일정은 한 id 에서 여러 번째가 나오므로 날짜까지 열쇠에 넣는다 — id 만 쓰면
 * 한 달치 반복이 한 건으로 줄어든다.
 */
function byId(lists: CalendarEvent[][]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  for (const list of lists) for (const ev of list) seen.set(occurrenceKey(ev), ev);
  return [...seen.values()];
}

/** 달력 한 칸을 가리키는 열쇠. 반복은 '원본 id + 그 번째 날짜' 다. */
export function occurrenceKey(event: CalendarEvent): string {
  return event.occurrenceDate ? `${event.id}:${event.occurrenceDate}` : String(event.id);
}

interface UseCalendarEventsProps {
  userId?: string;
  isAdmin?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarRef: React.RefObject<any>;
  /** 게시판 달력이면 그 게시판. 비우면 전사 공유 달력이다. */
  boardId?: string;
  /** 이 게시판의 관리자인가. 남이 세운 게시판 일정도 고칠 수 있다(서버와 같은 규칙). */
  canManageBoard?: boolean;
}

export const useCalendarEvents = ({
  userId,
  isAdmin = false,
  calendarRef,
  boardId,
  canManageBoard = false,
}: UseCalendarEventsProps) => {
  const [events, setEvents] = useState<EventInput[]>([]);
  // 레일은 보이는 달이 아니라 오늘 기준으로 고르므로 서버가 준 모양 그대로 들고 있는다.
  const [rawEvents, setRawEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  // 요청 ID 로 늦게 도착한 응답을 걸러낸다.
  const loadRequestIdRef = useRef(0);

  const canEditEvent = useCallback(
    (event: CalendarEvent) => {
      // 게시판 일정은 주인·관리자에 더해 그 게시판의 관리자도 고친다 — 서버의 규칙과 같다.
      // 화면이 더 너그러우면 눌러 본 뒤에야 403 을 보게 된다.
      return isAdmin || userId === event.UserId || (!!event.boardId && canManageBoard);
    },
    [userId, isAdmin, canManageBoard]
  );

  const loadEvents = useCallback(async () => {
    if (!userId) return;

    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;

    const view = calendarApi.view;
    const rail = railWindow();
    // 보이는 달과 레일 창을 한 번에 받는다. 따로 받으면 화면을 열 때마다, 일정을 저장할
    // 때마다 겹치는 범위를 두 번 묻게 된다.
    const start = new Date(Math.min(view.activeStart.getTime(), rail.start.getTime()));
    const end = new Date(Math.max(view.activeEnd.getTime(), rail.end.getTime()));
    const merged = end.getTime() - start.getTime() <= MAX_MERGED_DAYS * DAY_MS;

    // 요청 ID 를 올려 두고, 나중에 도착한 이전 응답은 무시한다.
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);

    try {
      const eventData = merged
        ? await getEvents(start, end, boardId)
        : byId(
            await Promise.all([
              getEvents(view.activeStart, view.activeEnd, boardId),
              getEvents(rail.start, rail.end, boardId),
            ])
          );

      // 가장 최근 요청의 응답만 반영한다.
      if (requestId !== loadRequestIdRef.current) return;

      const formattedEvents: EventInput[] = eventData.map((event: CalendarEvent) => ({
        id: occurrenceKey(event),
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.isAllday,
        backgroundColor:
          event.backgroundColor ||
          categoryColors[event.category as keyof typeof categoryColors]?.bg ||
          DEFAULT_EVENT_COLOR,
        borderColor:
          event.borderColor ||
          categoryColors[event.category as keyof typeof categoryColors]?.border ||
          DEFAULT_EVENT_COLOR,
        // textColor 는 주입하지 않는다. 인라인 style 이 calendar.css 의 color-mix 글자색을 덮는다.
        // 반복에서 펼쳐진 번째는 끌어 옮기지 않는다 — 한 번째만 옮기는 규칙이 없다.
        // 일정을 바꾸려면 원본을 열어 반복 규칙째 고친다.
        editable: canEditEvent(event) && !event.isRecurringOccurrence,
        startEditable: canEditEvent(event) && !event.isRecurringOccurrence,
        durationEditable: canEditEvent(event) && !event.isRecurringOccurrence,
        extendedProps: {
          body: event.body,
          category: event.category,
          location: event.location,
          userId: event.UserId,
          userName: event.user?.name,
          isReadOnly: event.isReadOnly,
          originalEvent: event,
        },
      }));

      setEvents(formattedEvents);
      setRawEvents(eventData);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      if (import.meta.env.DEV) console.error('❌ 이벤트 로드 실패:', error);
      toast.error('일정을 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.');
      // 네트워크 오류 시 빈 캘린더가 되지 않게 기존 이벤트를 유지한다.
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
    // boardId 가 바뀌면 다른 게시판의 달력이다. 빼 두면 탭을 옮겨도 앞 게시판 일정이 남는다.
  }, [userId, calendarRef, canEditEvent, boardId]);

  const handleCreateEvent = useCallback(
    async (formData: EventFormData) => {
      try {
        // UTC 자정 기준. 로컬 'T00:00:00' 을 쓰면 KST 에서 날짜가 하루 밀린다.
        const startDate = new Date(formData.start + 'T00:00:00Z');
        const endDate = new Date(dateUtils.addDay(formData.end) + 'T00:00:00Z');

        const eventData = {
          calendarId: 'default',
          title: formData.title,
          body: formData.body,
          isAllday: formData.isAllday ?? true,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          category: formData.category,
          location: formData.location,
          isReadOnly: false,
          color: formData.color,
          backgroundColor: formData.backgroundColor,
          borderColor: formData.color,
          // 반복은 규칙 한 줄로 보낸다. 서버가 보여 줄 때 펼친다.
          ...(formData.recurrenceType && formData.recurrenceType !== 'none'
            ? {
                recurrenceType: formData.recurrenceType,
                recurrenceEndDate: formData.recurrenceEndDate
                  ? new Date(formData.recurrenceEndDate + 'T00:00:00Z').toISOString()
                  : undefined,
                ...(formData.recurrenceType === 'weekly'
                  ? {
                      // 요일을 고르지 않았으면 시작일의 요일로 둔다(서버가 요일 배열을 요구한다)
                      recurrenceDays: formData.recurrenceDays?.length
                        ? formData.recurrenceDays
                        : [startDate.getUTCDay()],
                    }
                  : {}),
              }
            : {}),
        };

        // 게시판 달력에서 세운 일정은 그 게시판에 남는다
        await createEvent({ ...eventData, ...(boardId ? { boardId } : {}) });
        await loadEvents();
      } catch (error) {
        if (import.meta.env.DEV) console.error('❌ 이벤트 생성 실패:', error);
        throw error;
      }
    },
    [loadEvents, boardId]
  );

  /**
   * 반복 규칙을 요청에 싣는다. 만들 때와 고칠 때가 같은 모양이어야 한다 —
   * 고칠 때 싣지 않아서, 수정 창에서 '매주' 로 바꿔 저장해도 규칙이 그대로였다.
   *
   * 끄는 경우에는 recurrenceType 만 보낸다. 종료일·요일을 함께 보내면 서버가
   * '반복 옵션을 바꾸려면 recurrenceType 을 함께 지정하라' 며 거절한다.
   */
  function recurrencePayload(formData: EventFormData, startDate: Date) {
    const type = formData.recurrenceType ?? 'none';
    if (type === 'none') return { recurrenceType: 'none' as const };

    return {
      recurrenceType: type,
      recurrenceEndDate: formData.recurrenceEndDate
        ? new Date(formData.recurrenceEndDate + 'T00:00:00Z').toISOString()
        : undefined,
      ...(type === 'weekly'
        ? {
            // 요일을 고르지 않았으면 시작일의 요일로 둔다(서버가 요일 배열을 요구한다)
            recurrenceDays: formData.recurrenceDays?.length
              ? formData.recurrenceDays
              : [startDate.getUTCDay()],
          }
        : {}),
    };
  }

  const handleUpdateEvent = useCallback(
    async (eventId: number, formData: EventFormData, existingEvent?: CalendarEvent) => {
      try {
        const startDate = new Date(formData.start + 'T00:00:00Z');
        const endDate = new Date(dateUtils.addDay(formData.end) + 'T00:00:00Z');

        // 기존 isReadOnly 를 보존한다. false 로 덮으면 시간만 바꿔도 읽기 전용이 풀린다.
        const eventData = {
          calendarId: 'default',
          title: formData.title,
          body: formData.body,
          isAllday: formData.isAllday ?? existingEvent?.isAllday ?? true,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          category: formData.category,
          location: formData.location,
          isReadOnly: existingEvent?.isReadOnly ?? false,
          color: formData.color,
          backgroundColor: formData.backgroundColor,
          borderColor: formData.color,
          ...recurrencePayload(formData, startDate),
        };

        await updateEvent(eventId, eventData);
        await loadEvents();
      } catch (error) {
        if (import.meta.env.DEV) console.error('❌ 이벤트 수정 실패:', error);
        throw error;
      }
    },
    [loadEvents]
  );

  /**
   * 반복 중 이 날 하루만 고친다. 규칙은 그대로 두고 그 날을 건너뛴 뒤 그 자리에
   * 따로 선 일정을 세운다 — 둘 다 서버가 한 트랜잭션에서 한다.
   */
  const handleEditOccurrence = useCallback(
    async (eventId: number, date: string, formData: EventFormData, existing?: CalendarEvent) => {
      const startDate = new Date(formData.start + 'T00:00:00Z');
      const endDate = new Date(dateUtils.addDay(formData.end) + 'T00:00:00Z');

      await editOccurrence(eventId, date, {
        title: formData.title,
        body: formData.body,
        isAllday: formData.isAllday ?? existing?.isAllday ?? true,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        category: formData.category,
        location: formData.location,
        color: formData.color,
        backgroundColor: formData.backgroundColor,
        borderColor: formData.color,
      });
      await loadEvents();
    },
    [loadEvents]
  );

  const handleDeleteEvent = useCallback(
    async (eventId: number) => {
      try {
        await deleteEvent(eventId);
        await loadEvents();
      } catch (error) {
        if (import.meta.env.DEV) console.error('❌ 이벤트 삭제 실패:', error);
        throw error;
      }
    },
    [loadEvents]
  );

  return {
    events,
    rawEvents,
    loading,
    loadEvents,
    handleCreateEvent,
    handleUpdateEvent,
    handleEditOccurrence,
    handleDeleteEvent,
    canEditEvent,
  };
};
