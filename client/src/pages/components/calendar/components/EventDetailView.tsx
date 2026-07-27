// client/src/pages/components/calendar/components/EventDetailView.tsx
import React, { useRef, useEffect } from 'react';
import { CalendarEvent } from '../types';
import { categoryColors } from '../constants';
import { formatDateRange } from '../utils';
import { sanitizeHTML } from '../../../../utils/htmlSanitizer';
import { formatDateTime } from '../../../../utils/date';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/atom-one-dark.min.css';
import '../../../../styles/CKContentView.css';

const isHtmlContent = (body: string): boolean => /<[a-z][\s\S]*>/i.test(body);

interface EventDetailViewProps {
  event: CalendarEvent;
  canEdit: boolean;
  canDelete: boolean;
  deleting?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800
                      flex items-center justify-center flex-shrink-0 mt-0.5"
      >
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <p
          className="text-[11px] font-medium text-slate-400 dark:text-slate-500
                      uppercase tracking-wide mb-0.5"
        >
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

export const EventDetailView: React.FC<EventDetailViewProps> = ({
  event,
  canEdit,
  canDelete,
  deleting = false,
  onEdit,
  onDelete,
  onClose,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.querySelectorAll<HTMLElement>('pre code').forEach(block => {
      if (!block.dataset.highlighted) hljs.highlightElement(block);
    });
  }, [event.body]);

  const categoryInfo = categoryColors[event.category as keyof typeof categoryColors];
  const categoryLabel = categoryInfo?.label || '기타';
  const eventColor = event.backgroundColor || '#6366f1';

  return (
    <div className="space-y-5">
      {/* 제목 + 카테고리 배지 */}
      <div className="flex items-start gap-3">
        {/* 색상 인디케이터 */}
        <div
          className="w-1 self-stretch rounded-full flex-shrink-0 min-h-[2rem]"
          style={{ backgroundColor: eventColor }}
        />
        <div className="flex-1 min-w-0">
          <h3
            className="text-xl font-semibold text-slate-900 dark:text-slate-100
                         leading-snug break-words"
          >
            {event.title}
          </h3>
          <span
            className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full
                       text-xs font-semibold"
            style={{ backgroundColor: eventColor, color: categoryInfo?.textColor ?? '#ffffff' }}
          >
            {categoryLabel}
          </span>
        </div>
      </div>

      {/* 구분선 */}
      <div className="border-t border-slate-100 dark:border-slate-800" />

      {/* 정보 rows */}
      <div className="space-y-4">
        {/* 날짜 */}
        <InfoRow
          label="일정 날짜"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          }
        >
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {formatDateRange(event.start, event.end)}
          </p>
        </InfoRow>

        {/* 장소 */}
        {event.location && (
          <InfoRow
            label="장소"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            }
          >
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {event.location}
            </p>
          </InfoRow>
        )}

        {/* 상세 내용 */}
        {event.body && (
          <InfoRow
            label="상세 내용"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h7"
                />
              </svg>
            }
          >
            <div
              ref={bodyRef}
              className="mt-1 p-3 bg-slate-50 dark:bg-slate-800/60
                         border border-slate-200 dark:border-slate-700/60
                         rounded-lg overflow-x-auto"
            >
              {isHtmlContent(event.body) ? (
                <div
                  className="ck-content-view text-sm"
                  dangerouslySetInnerHTML={{ __html: sanitizeHTML(event.body) }}
                />
              ) : (
                <p
                  className="text-sm text-slate-800 dark:text-slate-200
                               whitespace-pre-wrap leading-relaxed"
                >
                  {event.body}
                </p>
              )}
            </div>
          </InfoRow>
        )}

        {/* 작성자 */}
        <InfoRow
          label="작성자"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          }
        >
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {event.user?.name || '알 수 없음'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {formatDateTime(event.createdAt)} 작성
          </p>
        </InfoRow>
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
        {canEdit && (
          <button
            onClick={onEdit}
            className="flex-1 inline-flex items-center justify-center gap-2
                       px-4 py-2.5 rounded-lg text-sm font-semibold
                       bg-primary-600 hover:bg-primary-700 active:bg-primary-800
                       text-white shadow-sm transition-all duration-150 active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            수정
          </button>
        )}

        {canDelete && (
          <button
            onClick={onDelete}
            disabled={deleting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold
                       border border-red-200 dark:border-red-800/60
                       text-red-600 dark:text-red-400
                       hover:bg-red-50 dark:hover:bg-red-900/20
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-150 active:scale-[0.98]"
          >
            {deleting ? (
              <>
                <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                삭제 중…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                삭제
              </>
            )}
          </button>
        )}

        <button
          onClick={onClose}
          className="px-4 py-2.5 rounded-lg text-sm font-medium
                     text-slate-600 dark:text-slate-400
                     bg-slate-100 dark:bg-slate-800
                     hover:bg-slate-200 dark:hover:bg-slate-700
                     hover:text-slate-800 dark:hover:text-slate-200
                     transition-colors duration-150"
        >
          닫기
        </button>
      </div>
    </div>
  );
};
