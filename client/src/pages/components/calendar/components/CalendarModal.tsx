// client/src/pages/components/calendar/components/CalendarModal.tsx
import React, { lazy, Suspense } from 'react';
import { ModalMode, CalendarEvent, EventFormData } from '../types';
import { EventDetailView } from './EventDetailView';

const EventForm = lazy(() => import('./EventForm').then(m => ({ default: m.EventForm })));

interface CalendarModalProps {
  isOpen: boolean;
  mode: ModalMode;
  selectedEvent: CalendarEvent | null;
  formData: EventFormData;
  canEdit: boolean;
  canDelete: boolean;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onFormChange: (data: Partial<EventFormData>) => void;
  onCancelEdit: () => void;
}

const MODE_META = {
  view: {
    label: '일정 상세',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  create: {
    label: '새 일정',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  edit: {
    label: '일정 수정',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    ),
  },
};

export const CalendarModal: React.FC<CalendarModalProps> = ({
  isOpen,
  mode,
  selectedEvent,
  formData,
  canEdit,
  canDelete,
  isSubmitting = false,
  isDeleting = false,
  onClose,
  onEdit,
  onDelete,
  onSubmit,
  onFormChange,
  onCancelEdit,
}) => {
  if (!isOpen) return null;

  const meta = MODE_META[mode];

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm
                 flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-slate-900
                   rounded-2xl shadow-2xl shadow-slate-900/20 dark:shadow-slate-950/60
                   border border-slate-200 dark:border-slate-800
                   w-full max-h-[90vh] overflow-y-auto animate-scaleIn
                   ${mode === 'view' ? 'max-w-xl' : 'max-w-3xl'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div
          className="flex items-center justify-between px-6 py-4
                        border-b border-slate-100 dark:border-slate-800 flex-shrink-0"
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center
                            text-white flex-shrink-0"
            >
              {meta.icon}
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {meta.label}
            </h2>
          </div>

          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500
                       hover:bg-slate-100 dark:hover:bg-slate-800
                       hover:text-slate-600 dark:hover:text-slate-300
                       transition-colors duration-150"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 모달 내용 */}
        <div className="p-6">
          {mode === 'view' && selectedEvent && (
            <EventDetailView
              event={selectedEvent}
              canEdit={canEdit}
              canDelete={canDelete}
              deleting={isDeleting}
              onEdit={onEdit}
              onDelete={onDelete}
              onClose={onClose}
            />
          )}

          {(mode === 'create' || mode === 'edit') && (
            <Suspense
              fallback={
                <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">에디터 로딩 중...</span>
                </div>
              }
            >
              <EventForm
                key={`${mode}-${selectedEvent?.id ?? 'new'}`}
                formData={formData}
                onSubmit={onSubmit}
                onChange={onFormChange}
                onCancel={mode === 'edit' ? onCancelEdit : onClose}
                mode={mode}
                submitting={isSubmitting}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
};
