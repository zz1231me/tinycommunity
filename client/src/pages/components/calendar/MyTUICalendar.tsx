// client/src/pages/components/calendar/MyTUICalendar.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import koLocale from '@fullcalendar/core/locales/ko';
import { EventClickArg, DateSelectArg, EventDropArg } from '@fullcalendar/core';
import { useAuth } from '../../../store/auth';
import { updateEvent } from '../../../api/events';
import { toast } from '../../../utils/toast';

import { CalendarEvent, EventFormData, ModalMode } from './types';
import { dateUtils } from './utils';
import { useCalendarEvents } from './hooks/useCalendarEvents';
import { CalendarHeader, CalendarView } from './components/CalendarHeader';
import { CalendarModal } from './components/CalendarModal';
import { ConfirmationModal } from '../../../components/admin/common/ConfirmationModal';
import './styles/calendar.css';

const DEFAULT_FORM: EventFormData = {
  title: '',
  body: '',
  isAllday: true,
  start: '',
  end: '',
  category: '',
  location: '',
  color: '#6366f1',
  backgroundColor: '#6366f1',
};

const MyTUICalendar: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const calendarRef = useRef<FullCalendar>(null);

  const {
    events,
    loading,
    loadEvents,
    handleCreateEvent,
    handleUpdateEvent,
    handleDeleteEvent,
    canEditEvent,
  } = useCalendarEvents({ userId: user?.id, isAdmin: isAdmin(), calendarRef });

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('view');
  // 편집 취소 시 복원할 폼 스냅샷
  const formDataSnapshotRef = useRef<EventFormData | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentView, setCurrentView] = useState<CalendarView>('dayGridMonth');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [calendarTitle, setCalendarTitle] = useState('');
  const [formData, setFormData] = useState<EventFormData>(DEFAULT_FORM);

  // 시계 업데이트
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 로그인 후 이벤트 로드
  useEffect(() => {
    if (user?.id) loadEvents();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 오늘 날짜 문자열 (날짜가 바뀔 때만 재계산)
  const todayStr = useMemo(
    () => dateUtils.toLocalDateString(new Date()),
    [currentTime.toDateString()] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ──── 네비게이션 ──── */
  const handlePrev = () => calendarRef.current?.getApi().prev();
  const handleNext = () => calendarRef.current?.getApi().next();
  const handleToday = () => calendarRef.current?.getApi().today();

  const handleViewChange = useCallback((view: CalendarView) => {
    calendarRef.current?.getApi().changeView(view);
    setCurrentView(view);
  }, []);

  /* ──── 날짜 선택 (새 일정) ──── */
  const handleDateSelect = (selectInfo: DateSelectArg) => {
    const startStr = dateUtils.toLocalDateString(selectInfo.start);
    const endStr = dateUtils.subtractDay(dateUtils.toLocalDateString(selectInfo.end));
    setFormData({ ...DEFAULT_FORM, start: startStr, end: endStr });
    setModalMode('create');
    setSelectedEvent(null);
    setIsModalOpen(true);
    selectInfo.view.calendar.unselect();
  };

  /* ──── 이벤트 클릭 (상세보기) ──── */
  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event;
    const originalEvent = event.extendedProps.originalEvent as CalendarEvent;
    setSelectedEvent(originalEvent);

    const startDate = event.startStr
      ? dateUtils.isoToLocalDate(event.startStr)
      : event.start
        ? dateUtils.toLocalDateString(event.start)
        : dateUtils.isoToLocalDate(originalEvent.start);

    const endDate = event.endStr
      ? dateUtils.subtractDay(dateUtils.isoToLocalDate(event.endStr))
      : event.end
        ? dateUtils.subtractDay(dateUtils.toLocalDateString(event.end))
        : originalEvent.end
          ? dateUtils.subtractDay(dateUtils.isoToLocalDate(originalEvent.end))
          : startDate;

    setFormData({
      title: event.title,
      body: event.extendedProps.body || '',
      isAllday: originalEvent.isAllday ?? event.allDay,
      start: startDate,
      end: endDate,
      category: event.extendedProps.category || 'meeting',
      location: event.extendedProps.location || '',
      color: event.backgroundColor || '#6366f1',
      backgroundColor: event.backgroundColor || '#6366f1',
    });
    setModalMode('view');
    setIsModalOpen(true);
  };

  /* ──── 드래그/리사이즈 공통 처리 ──── */
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
        // 종일 이벤트는 생성/모달 수정 경로와 동일하게 "로컬 날짜 → UTC 자정"으로 정규화한다.
        // FullCalendar의 drag/resize는 event.start를 로컬 자정 Date로 주므로 그대로 toISOString()하면
        // 15:00Z 같은 비정규 값으로 저장돼(생성 경로의 00:00Z와 불일치) 관리자 표시/기간필터가 어긋난다.
        // 시간 지정 이벤트는 시각이 의미 있으므로 그대로 둔다.
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
        await loadEvents();
      } catch (error) {
        toast.error(
          `일정 수정에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
        );
        revert();
        await loadEvents();
      }
    },
    [canEditEvent, loadEvents]
  );

  const handleEventDrop = (info: EventDropArg) => {
    void applyEventDateChange(info.event, info.revert);
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    void applyEventDateChange(info.event, info.revert);
  };

  /* ──── 폼 제출 ──── */
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
      else if (modalMode === 'edit' && selectedEvent)
        await handleUpdateEvent(selectedEvent.id, formData, selectedEvent);
      setIsModalOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '일정 저장에 실패했습니다.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ──── 삭제 ──── */
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

  const handleDatesSet = (dateInfo: { view: { title: string } }) => {
    setCalendarTitle(dateInfo.view.title);
    void loadEvents();
  };

  /* ──── 렌더 ──── */
  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* 캘린더 카드 */}
      <div
        className="flex-1 flex flex-col min-h-0 mx-4 my-4 sm:mx-6 sm:my-5
                      bg-white dark:bg-slate-900
                      rounded-2xl border border-slate-200 dark:border-slate-800
                      shadow-sm overflow-hidden relative"
      >
        {/* 상단 accent 라인 */}
        <div className="h-[3px] bg-gradient-to-r from-primary-500 via-primary-600 to-secondary-600 flex-shrink-0" />

        {/* 헤더 */}
        <CalendarHeader
          currentTime={currentTime}
          loading={loading}
          title={calendarTitle}
          currentView={currentView}
          onPrev={handlePrev}
          onNext={handleNext}
          onToday={handleToday}
          onViewChange={handleViewChange}
        />

        {/* 캘린더 본체 */}
        <div className="flex-1 min-h-0 p-3 sm:p-4">
          <div className="calendar-wrapper h-full">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              locale={koLocale}
              headerToolbar={false}
              initialView="dayGridMonth"
              height="100%"
              events={events}
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
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventAllow={(_, draggedEvent) => {
                if (!draggedEvent) return false;
                const originalEvent = draggedEvent.extendedProps.originalEvent as CalendarEvent;
                return canEditEvent(originalEvent) && !originalEvent.isReadOnly;
              }}
              datesSet={handleDatesSet}
              nowIndicator={true}
              weekends={true}
              fixedWeekCount={false}
              showNonCurrentDates={false}
              noEventsContent={() => <div className="fc-no-events-msg">등록된 일정이 없습니다</div>}
              dayCellClassNames={arg =>
                dateUtils.toLocalDateString(arg.date) === todayStr ? ['today-highlight'] : []
              }
            />
          </div>
        </div>

        {/* 로딩 오버레이 */}
        {loading && (
          <div
            className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm
                          flex items-center justify-center z-30"
          >
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-10 h-10 border-[3px] border-primary-200 dark:border-primary-900
                              border-t-primary-600 rounded-full animate-spin"
              />
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                일정을 불러오는 중
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 이벤트 모달 */}
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
          setModalMode('edit');
        }}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        onFormChange={data => setFormData(prev => ({ ...prev, ...data }))}
        onCancelEdit={() => {
          setModalMode('view');
          if (formDataSnapshotRef.current) setFormData(formDataSnapshotRef.current);
        }}
      />

      {/* 삭제 확인 모달 — ConfirmationModal로 통합 (ESC/focus trap/aria 지원) */}
      <ConfirmationModal
        open={showDeleteConfirm}
        title="일정 삭제"
        message={`"${selectedEvent?.title ?? ''}" 일정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel={isDeleting ? '삭제 중…' : '삭제'}
        cancelLabel="취소"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default MyTUICalendar;
