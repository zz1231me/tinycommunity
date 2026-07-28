// client/src/pages/components/calendar/components/EventDetailView.tsx
import { DEFAULT_EVENT_COLOR } from '../../../../constants/colors';
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

// 메타 한 줄 — 아이콘 + 값 (라벨 없이 컴팩트)
function MetaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
      <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-slate-400 dark:text-slate-500">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
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
  onClose: _onClose, // 닫기는 헤더 X·배경 클릭으로 처리 — 하단 중복 버튼 제거
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.querySelectorAll<HTMLElement>('pre code').forEach(block => {
      if (!block.dataset.highlighted) hljs.highlightElement(block);
    });
  }, [event.body]);

  const categoryInfo = categoryColors[event.category as keyof typeof categoryColors];
  const categoryLabel = categoryInfo?.label || '기타';
  const eventColor = event.backgroundColor || DEFAULT_EVENT_COLOR;

  return (
    <div className="space-y-4">
      {/* 히어로 — 색 틴트 + 카테고리 + 제목 + 날짜(핵심 정보를 상단에 모음) */}
      <div
        className="rounded-2xl px-5 py-4"
        style={{ background: `color-mix(in srgb, ${eventColor} 12%, transparent)` }}
      >
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: eventColor, color: categoryInfo?.textColor ?? '#ffffff' }}
        >
          {categoryLabel}
        </span>
        <h3 className="mt-2.5 break-words text-xl font-bold leading-snug text-slate-900 dark:text-slate-100">
          {event.title}
        </h3>
        <div
          className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: `color-mix(in srgb, ${eventColor} 45%, #0f172a)` }}
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {formatDateRange(event.start, event.end)}
        </div>
      </div>

      {/* 메타 — 장소·작성자 (라벨 없이 컴팩트 인라인) */}
      <div className="space-y-3 px-1">
        {event.location && (
          <MetaRow
            icon={
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <span className="font-medium text-slate-800 dark:text-slate-200">{event.location}</span>
          </MetaRow>
        )}
        <MetaRow
          icon={
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          }
        >
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {event.user?.name || '알 수 없음'}
          </span>
          <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
            {formatDateTime(event.createdAt)} 작성
          </span>
        </MetaRow>
      </div>

      {/* 본문 — 라벨 + 가벼운 카드 */}
      {event.body && (
        <div className="px-1">
          <p className="mb-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">메모</p>
          <div
            ref={bodyRef}
            className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
          >
            {isHtmlContent(event.body) ? (
              <div
                className="ck-content-view text-sm"
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(event.body) }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {event.body}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 액션 — 수정/삭제만(닫기는 헤더 X·배경 클릭으로 대체). 권한 없으면 숨김 */}
      {(canEdit || canDelete) && (
        <div className="flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        {canEdit && (
          <button onClick={onEdit} className="btn-primary flex-1">
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
            className={`btn-danger ${canEdit ? '' : 'flex-1'}`}
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
        </div>
      )}
    </div>
  );
};
