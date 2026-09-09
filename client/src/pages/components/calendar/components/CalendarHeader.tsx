// client/src/pages/components/calendar/components/CalendarHeader.tsx
import React from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export type CalendarView = 'dayGridMonth' | 'dayGridWeek' | 'listMonth';

const VIEW_OPTIONS: { key: CalendarView; label: string }[] = [
  { key: 'dayGridMonth', label: '월간' },
  { key: 'dayGridWeek', label: '주간' },
  { key: 'listMonth', label: '목록' },
];

// 시계는 자체 상태로 매초 갱신 — 부모(캘린더 전체)가 아니라 이 텍스트만 리렌더된다.
const LiveClock: React.FC = React.memo(() => {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums tracking-tight">
      {format(now, 'HH:mm:ss', { locale: ko })}
    </span>
  );
});
LiveClock.displayName = 'LiveClock';

interface CalendarHeaderProps {
  loading: boolean;
  title?: string;
  currentView: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
}

const CalendarHeaderBase: React.FC<CalendarHeaderProps> = ({
  loading,
  title = '',
  currentView,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}) => {
  return (
    <div
      className="flex-shrink-0 px-5 py-3 bg-white dark:bg-slate-900
                    border-b border-slate-200 dark:border-slate-800"
    >
      {/* 모바일: 2행 레이아웃 / 데스크톱: 1행 레이아웃 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {/* 상단/왼쪽 — 제목 + 네비게이션 */}
        <div className="flex items-center gap-3">
          {/* 이전/다음 */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 flex-shrink-0">
            <button
              onClick={onPrev}
              title="이전"
              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400
                         hover:bg-white dark:hover:bg-slate-700
                         hover:text-slate-800 dark:hover:text-slate-200
                         hover:shadow-sm transition-all duration-150"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={onNext}
              title="다음"
              className="p-1.5 rounded-md text-slate-500 dark:text-slate-400
                         hover:bg-white dark:hover:bg-slate-700
                         hover:text-slate-800 dark:hover:text-slate-200
                         hover:shadow-sm transition-all duration-150"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* 제목 */}
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {title}
          </h2>
        </div>

        {/* 하단/오른쪽 — 오늘 버튼 + 뷰 탭 + 시계 */}
        <div className="flex items-center gap-2">
          {/* 오늘 버튼 */}
          <button
            onClick={onToday}
            className="px-3 py-1.5 text-sm font-medium
                       bg-primary-600 hover:bg-primary-700 active:bg-primary-800
                       text-white rounded-lg shadow-sm
                       transition-all duration-150 active:scale-[0.97] flex-shrink-0"
          >
            오늘
          </button>

          {/* 뷰 전환 탭 */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {VIEW_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => onViewChange(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150
                  ${
                    currentView === opt.key
                      ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm font-semibold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 로딩 표시 */}
          {loading && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400">
              <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">불러오는 중</span>
            </div>
          )}

          {/* 현재 시각 */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5
                          bg-slate-50 dark:bg-slate-800
                          border border-slate-200 dark:border-slate-700
                          rounded-lg"
          >
            <span className="relative flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full block" />
              <span className="absolute inset-0 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping opacity-60" />
            </span>
            <LiveClock />
          </div>
        </div>
      </div>
    </div>
  );
};

// props가 바뀔 때만 리렌더 — 부모의 잦은 리렌더로부터 헤더를 보호
export const CalendarHeader = React.memo(CalendarHeaderBase);
