import { useState, useCallback, useRef } from 'react';
import { EventInput } from '@fullcalendar/core';
import { getEvents, createEvent, updateEvent, deleteEvent } from '../../../../api/events';
import { CalendarEvent, EventFormData } from '../types';
import { categoryColors } from '../constants';
import { dateUtils } from '../utils';
import { toast } from '../../../../utils/toast';
import { DEFAULT_EVENT_COLOR } from '../../../../constants/colors';

interface UseCalendarEventsProps {
  userId?: string;
  isAdmin?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendarRef: React.RefObject<any>;
}

export const useCalendarEvents = ({
  userId,
  isAdmin = false,
  calendarRef,
}: UseCalendarEventsProps) => {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);
  // 요청 ID 로 늦게 도착한 응답을 걸러낸다.
  const loadRequestIdRef = useRef(0);

  const canEditEvent = useCallback(
    (event: CalendarEvent) => {
      return isAdmin || userId === event.UserId;
    },
    [userId, isAdmin]
  );

  const loadEvents = useCallback(async () => {
    if (!userId) return;

    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;

    const view = calendarApi.view;
    const start = view.activeStart;
    const end = view.activeEnd;

    // 요청 ID 를 올려 두고, 나중에 도착한 이전 응답은 무시한다.
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);

    try {
      const eventData = await getEvents(start, end);

      // 가장 최근 요청의 응답만 반영한다.
      if (requestId !== loadRequestIdRef.current) return;

      const formattedEvents: EventInput[] = eventData.map((event: CalendarEvent) => ({
        id: event.id.toString(),
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
        editable: canEditEvent(event),
        startEditable: canEditEvent(event),
        durationEditable: canEditEvent(event),
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
  }, [userId, calendarRef, canEditEvent]);

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
        };

        await createEvent(eventData);
        await loadEvents();
      } catch (error) {
        if (import.meta.env.DEV) console.error('❌ 이벤트 생성 실패:', error);
        throw error;
      }
    },
    [loadEvents]
  );

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
    loading,
    loadEvents,
    handleCreateEvent,
    handleUpdateEvent,
    handleDeleteEvent,
    canEditEvent,
  };
};
