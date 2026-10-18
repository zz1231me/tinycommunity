// FullCalendar 기반 일정 화면
import { DEFAULT_EVENT_COLOR } from '../../../constants/colors';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import koLocale from '@fullcalendar/core/locales/ko';
import { EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core';
import { useAuth } from '../../../store/auth';
import { skipOccurrence, updateEvent } from '../../../api/events';
import { toast } from '../../../utils/toast';

import { CalendarEvent, EventFormData, ModalMode } from './types';
import { dateUtils } from './utils';
import { toFormData, type EditScope } from './eventFormData';

/** 범위를 바꿀 때 날짜 두 칸만 갈아 끼운다 */
const pickDates = (f: EventFormData) => ({ start: f.start, end: f.end });
import { useNavigate } from 'react-router-dom';
import { useCalendarEvents, railWindow } from './hooks/useCalendarEvents';
import { useTaskEvents } from './hooks/useTaskEvents';
import { CalendarHeader, CalendarView } from './components/CalendarHeader';
import { CalendarModal } from './components/CalendarModal';
import { TodayRail } from './components/TodayRail';
import { ConfirmationModal } from '../../../components/admin/common/ConfirmationModal';
import './styles/calendar.css';

const renderNoEvents = () => <div className="fc-no-events-msg">등록된 일정이 없습니다</div>;

const DEFAULT_FORM: EventFormData = {
  title: '',
  body: '',
  isAllday: true,
  start: '',
  end: '',
  category: '',
  location: '',
  color: DEFAULT_EVENT_COLOR,
  backgroundColor: DEFAULT_EVENT_COLOR,
};

const CalendarPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const calendarRef = useRef<FullCalendar>(null);

  const {
    events,
    rawEvents,
    loading,
    loadEvents,
    handleCreateEvent,
    handleUpdateEvent,
    handleEditOccurrence,
    handleDeleteEvent,
    canEditEvent,
  } = useCalendarEvents({ userId: user?.id, isAdmin: isAdmin(), calendarRef });

  // 내 업무의 일정. 달력 일정과 섞어 보여 주되, 누르면 그 글로 간다.
  const taskEvents = useTaskEvents();
  const calendarEvents = useMemo(() => [...events, ...taskEvents], [events, taskEvents]);
  const navigate = useNavigate();

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('view');
  const formDataSnapshotRef = useRef<EventFormData | null>(null);
  const [todayStr, setTodayStr] = useState(() => dateUtils.toLocalDateString(new Date()));
  const [currentView, setCurrentView] = useState<CalendarView>('dayGridMonth');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [calendarTitle, setCalendarTitle] = useState('');
  const [formData, setFormData] = useState<EventFormData>(DEFAULT_FORM);
  /** 반복의 번째를 고칠 때, 이 날만인지 반복 전체인지. 기본은 덜 위험한 '이 날만'. */
  const [editScope, setEditScope] = useState<EditScope>('one');

  // 날짜가 바뀔 때만 갱신한다. 초 단위 시계는 CalendarHeader 가 따로 들고 있다.
  useEffect(() => {
    const timer = setInterval(() => {
      const s = dateUtils.toLocalDateString(new Date());
      setTodayStr(prev => (prev !== s ? s : prev));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user?.id) loadEvents();
    // 자정을 넘기면 레일 창이 하루 밀리므로 그 범위까지 다시 받는다.
  }, [user?.id, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrev = useCallback(() => calendarRef.current?.getApi().prev(), []);
  const handleNext = useCallback(() => calendarRef.current?.getApi().next(), []);
  const handleToday = useCallback(() => calendarRef.current?.getApi().today(), []);

  // 이벤트 색을 CSS 변수 --ev 로 넘겨 color-mix 로 틴트를 만든다.
  const handleEventDidMount = useCallback(
    (arg: {
      el: HTMLElement;
      event: {
        backgroundColor: string;
        borderColor: string;
        title: string;
        extendedProps?: { fullTitle?: string };
      };
    }) => {
      const color = arg.event.backgroundColor || arg.event.borderColor;
      if (color) arg.el.style.setProperty('--ev', color);
      // 업무 칩은 좁은 칸을 위해 이름만 싣는다. 무엇인지는 여기 툴팁이 말해 준다.
      const tooltip = arg.event.extendedProps?.fullTitle || arg.event.title;
      if (tooltip) arg.el.setAttribute('title', tooltip);
    },
    []
  );

  const handleViewChange = useCallback((view: CalendarView) => {
    calendarRef.current?.getApi().changeView(view);
    setCurrentView(view);
  }, []);

  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    const startStr = dateUtils.toLocalDateString(selectInfo.start);
    const endStr = dateUtils.subtractDay(dateUtils.toLocalDateString(selectInfo.end));
    setFormData({ ...DEFAULT_FORM, start: startStr, end: endStr });
    setModalMode('create');
    setSelectedEvent(null);
    setIsModalOpen(true);
    selectInfo.view.calendar.unselect();
  }, []);

  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      const event = clickInfo.event;
      const taskLink = event.extendedProps.taskLink as string | undefined;
      if (taskLink) {
        navigate(taskLink);
        return;
      }
      const originalEvent = event.extendedProps.originalEvent as CalendarEvent;
      setSelectedEvent(originalEvent);

      // 반복의 번째를 눌렀으면 규칙의 시작을 채운다 — 수정 창은 규칙을 고치는 창이다.
      // 그 번째의 날짜를 채우면 제목만 바꿔 저장해도 규칙의 시작이 그 날로 밀린다.
      const base = toFormData(originalEvent);

      // 번째가 아닌 일정은 달력이 보는 날짜가 더 정확하다(여러 날·종일 처리).
      const fromCalendar = originalEvent.isRecurringOccurrence
        ? {}
        : {
            start: event.startStr
              ? dateUtils.isoToLocalDate(event.startStr)
              : event.start
                ? dateUtils.toLocalDateString(event.start)
                : base.start,
            end: event.endStr
              ? dateUtils.subtractDay(dateUtils.isoToLocalDate(event.endStr))
              : event.end
                ? dateUtils.subtractDay(dateUtils.toLocalDateString(event.end))
                : base.end,
          };

      setFormData({
        ...base,
        ...fromCalendar,
        isAllday: originalEvent.isAllday ?? event.allDay,
      });
      setModalMode('view');
      setIsModalOpen(true);
    },
    [navigate]
  );

  const openEventDetail = useCallback((ev: CalendarEvent) => {
    setSelectedEvent(ev);
    setFormData(toFormData(ev));
    setModalMode('view');
    setIsModalOpen(true);
  }, []);

  // 레일은 달력과 같은 응답에서 고른다. 따로 부르면 겹치는 범위를 두 번 묻게 된다
  // (useCalendarEvents 가 보이는 달과 레일 창을 함께 받아 온다).
  const railEvents = useMemo(() => {
    const { start, end } = railWindow();
    const from = dateUtils.toLocalDateString(start);
    const to = dateUtils.toLocalDateString(end);
    return rawEvents.filter(ev => {
      const s = dateUtils.isoToLocalDate(ev.start);
      const e = ev.end ? dateUtils.isoToLocalDate(ev.end) : s;
      return s < to && e >= from; // 창에 걸치기만 해도 레일이 쓴다(여러 날 일정)
    });
    // todayStr 이 넘어가면 창도 하루 민다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEvents, todayStr]);

  const applyEventDateChange = useCallback(
    async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: { start: Date | null; end: Date | null; extendedProps: Record<string, any> },
      revert: () => void
    ) => {
      const originalEvent = event.extendedProps.originalEvent as CalendarEvent;
      if (!canEditEvent(originalEvent) || originalEvent.isReadOnly) {
        toast.error('이 일정을 수정할 권한이 없습니다.');
        revert();
        return;
      }
      try {
        const startDate = event.start!;
        const endDate = dateUtils.ensureMinimumDuration(startDate, event.end);
        const isAllday = originalEvent.isAllday ?? true;
        // 종일 이벤트는 로컬 날짜를 UTC 자정으로 정규화한다. 그대로 두면 생성 경로와 값이 어긋난다.
        const startISO = isAllday
          ? new Date(dateUtils.toLocalDateString(startDate) + 'T00:00:00Z').toISOString()
          : startDate.toISOString();
        const endISO = isAllday
          ? new Date(dateUtils.toLocalDateString(endDate) + 'T00:00:00Z').toISOString()
          : endDate.toISOString();
        await updateEvent(originalEvent.id, {
          calendarId: originalEvent.calendarId,
          title: originalEvent.title,
          body: originalEvent.body || '',
          isAllday,
          start: startISO,
          end: endISO,
          category: originalEvent.category,
          location: originalEvent.location || '',
          isReadOnly: originalEvent.isReadOnly,
          color: originalEvent.color,
          backgroundColor: originalEvent.backgroundColor,
          borderColor: originalEvent.borderColor,
        });
      } catch (error) {
        toast.error(
          `일정 수정에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
        );
        revert();
        await loadEvents().catch(() => {});
        return;
      }

      // 저장은 이미 끝났으므로 목록 갱신 실패로 되돌리지 않는다.
      await loadEvents().catch(() => {});
    },
    [canEditEvent, loadEvents]
  );

  const handleEventDrop = useCallback(
    (info: EventDropArg) => void applyEventDateChange(info.event, info.revert),
    [applyEventDateChange]
  );

  const handleEventResize = useCallback(
    (info: EventResizeDoneArg) => void applyEventDateChange(info.event, info.revert),
    [applyEventDateChange]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!formData.title.trim()) {
      toast.error('제목을 입력해주세요.');
      return;
    }
    if (!formData.category) {
      toast.error('일정 종류를 선택해주세요.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (modalMode === 'create') await handleCreateEvent(formData);
      else if (modalMode === 'edit' && selectedEvent) {
        const onlyThisDay =
          selectedEvent.isRecurringOccurrence &&
          editScope === 'one' &&
          selectedEvent.occurrenceDate;
        if (onlyThisDay) {
          await handleEditOccurrence(
            selectedEvent.id,
            selectedEvent.occurrenceDate!,
            formData,
            selectedEvent
          );
          toast.success('이 날만 따로 저장했습니다.');
        } else {
          await handleUpdateEvent(selectedEvent.id, formData, selectedEvent);
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '일정 저장에 실패했습니다.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!selectedEvent || isDeleting) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!selectedEvent) return;
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await handleDeleteEvent(selectedEvent.id);
      setIsModalOpen(false);
    } catch {
      toast.error('일정 삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  /** 반복 중 이 날 하루만 건너뛴다. 규칙은 그대로 두므로 지우기와 따로 둔다. */
  const handleSkipOccurrence = async () => {
    if (!selectedEvent?.occurrenceDate || isDeleting) return;
    setIsDeleting(true);
    try {
      await skipOccurrence(selectedEvent.id, selectedEvent.occurrenceDate);
      setIsModalOpen(false);
      await loadEvents();
      toast.success('이 날은 건너뜁니다.');
    } catch {
      toast.error('건너뛰지 못했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDatesSet = useCallback(
    (dateInfo: { view: { title: string } }) => {
      setCalendarTitle(dateInfo.view.title);
      void loadEvents();
    },
    [loadEvents]
  );

  const eventAllow = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_: any, draggedEvent: any) => {
      if (!draggedEvent) return false;
      const originalEvent = draggedEvent.extendedProps.originalEvent as CalendarEvent;
      return canEditEvent(originalEvent) && !originalEvent.isReadOnly;
    },
    [canEditEvent]
  );

  const dayCellClassNames = useCallback(
    (arg: { date: Date }) =>
      dateUtils.toLocalDateString(arg.date) === todayStr ? ['today-highlight'] : [],
    [todayStr]
  );

  return (
    <div className="h-full flex flex-col xl:flex-row bg-slate-50 dark:bg-slate-900">
      <div
        className="flex-1 flex flex-col min-h-0 m-4 sm:m-6 xl:mr-4
                      bg-white dark:bg-slate-900
                      rounded-2xl border border-slate-200 dark:border-slate-800
                      shadow-sm overflow-hidden relative"
      >
        <CalendarHeader
          loading={loading}
          title={calendarTitle}
          currentView={currentView}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          onViewChange={handleViewChange}
        />

        {/* expandRows 로 카드 높이를 채우고 행을 균등 분배한다 */}
        <div className="flex-1 min-h-0 p-3 sm:p-4">
          <div className="calendar-wrapper h-full">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin, listPlugin]}
              locale={koLocale}
              headerToolbar={false}
              initialView="dayGridMonth"
              height="100%"
              expandRows={true}
              events={calendarEvents}
              selectable={true}
              selectMirror={true}
              unselectAuto={true}
              editable={true}
              eventDragMinDistance={5}
              dragRevertDuration={300}
              dragScroll={true}
              longPressDelay={200}
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventDidMount={handleEventDidMount}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventAllow={eventAllow}
              datesSet={handleDatesSet}
              nowIndicator={true}
              weekends={true}
              fixedWeekCount={false}
              showNonCurrentDates={false}
              dayMaxEvents={4}
              noEventsContent={renderNoEvents}
              dayCellClassNames={dayCellClassNames}
            />
          </div>
        </div>
      </div>

      {/* 넓은 화면에서만 보이는 오늘·다가오는 일정 레일 */}
      <TodayRail events={railEvents} todayStr={todayStr} onSelect={openEventDetail} />

      <CalendarModal
        isOpen={isModalOpen}
        mode={modalMode}
        selectedEvent={selectedEvent}
        formData={formData}
        canEdit={selectedEvent ? canEditEvent(selectedEvent) : false}
        canDelete={selectedEvent ? canEditEvent(selectedEvent) && !selectedEvent.isReadOnly : false}
        isSubmitting={isSubmitting}
        isDeleting={isDeleting}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedEvent(null);
          setFormData(DEFAULT_FORM);
        }}
        onEdit={() => {
          formDataSnapshotRef.current = formData;
          // 창을 열 때 폼은 규칙의 시작으로 채워져 있다. '이 날만' 으로 들어가므로
          // 날짜를 눌린 그 날로 돌려놓는다.
          if (selectedEvent?.isRecurringOccurrence) {
            setEditScope('one');
            setFormData(prev => ({ ...prev, ...pickDates(toFormData(selectedEvent, 'one')) }));
          }
          setModalMode('edit');
        }}
        editScope={selectedEvent?.isRecurringOccurrence ? editScope : undefined}
        onEditScopeChange={scope => {
          setEditScope(scope);
          // 범위가 바뀌면 보는 날짜도 바뀐다. 적어 둔 제목·내용은 그대로 둔다.
          if (selectedEvent) {
            setFormData(prev => ({ ...prev, ...pickDates(toFormData(selectedEvent, scope)) }));
          }
        }}
        onDelete={handleDelete}
        onSkipOccurrence={() => void handleSkipOccurrence()}
        onSubmit={handleSubmit}
        onFormChange={data => setFormData(prev => ({ ...prev, ...data }))}
        onCancelEdit={() => {
          setModalMode('view');
          if (formDataSnapshotRef.current) setFormData(formDataSnapshotRef.current);
        }}
      />

      <ConfirmationModal
        open={showDeleteConfirm}
        title="일정 삭제"
        message={
          // 번째를 눌러 들어왔어도 지워지는 것은 규칙 한 줄이다 — 반복 전체가 사라진다.
          // 그 날 하루만 빼려면 '이 날 건너뛰기' 가 따로 있다.
          selectedEvent?.isRecurringOccurrence
            ? `"${selectedEvent.title}" 은(는) 반복 일정입니다. 이 날만이 아니라 반복 전체가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
            : `"${selectedEvent?.title ?? ''}" 일정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
        }
        confirmLabel={isDeleting ? '삭제 중…' : '삭제'}
        cancelLabel="취소"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default CalendarPage;
