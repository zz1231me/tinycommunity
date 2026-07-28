// client/src/pages/components/calendar/components/TodayRail.tsx
// 캘린더 우측 레일 — '오늘 일정'과 '다가오는 일정'을 모아 보여준다(넓은 화면 전용).
// ★보이는 달과 무관하게 오늘 기준으로 표시하도록, CalendarEvent[]를 직접 받는다.
import { CalendarEvent } from '../types';
import { categoryColors } from '../constants';
import { DEFAULT_EVENT_COLOR } from '../../../../constants/colors';
import { dateUtils } from '../utils';

interface TodayRailProps {
  events: CalendarEvent[];
  todayStr: string; // 'YYYY-MM-DD'
  onSelect: (event: CalendarEvent) => void;
}

interface RailItem {
  original: CalendarEvent;
  title: string;
  color: string;
  startD: string; // 'YYYY-MM-DD'
  endD: string; // 포함되는 마지막 날 (allDay 종료는 배타적이라 하루 뺌)
  multiDay: boolean;
}

const toItem = (ev: CalendarEvent): RailItem => {
  const startD = dateUtils.isoToLocalDate(ev.start);
  const endD = ev.end ? dateUtils.subtractDay(dateUtils.isoToLocalDate(ev.end)) : startD;
  return {
    original: ev,
    title: ev.title,
    color:
      ev.backgroundColor ||
      categoryColors[ev.category as keyof typeof categoryColors]?.bg ||
      DEFAULT_EVENT_COLOR,
    startD,
    endD: endD >= startD ? endD : startD,
    multiDay: endD > startD,
  };
};

// 'YYYY-MM-DD' → 'M/D (요일)'
const dow = ['일', '월', '화', '수', '목', '금', '토'];
const label = (d: string): string => {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  return `${m}/${day} (${dow[dt.getDay()]})`;
};

function EventRow({ item, onSelect }: { item: RailItem; onSelect: (e: CalendarEvent) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.original)}
      title={item.title}
      className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <span
        className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: item.color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
          {item.title}
        </span>
        <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
          {item.multiDay ? `${label(item.startD)} – ${label(item.endD)}` : label(item.startD)}
        </span>
      </span>
    </button>
  );
}

export function TodayRail({ events, todayStr, onSelect }: TodayRailProps) {
  const items = events.map(toItem);

  const today = items
    .filter(i => i.startD <= todayStr && todayStr <= i.endD)
    .sort((a, b) => a.startD.localeCompare(b.startD));

  const upcoming = items
    .filter(i => i.startD > todayStr)
    .sort((a, b) => a.startD.localeCompare(b.startD))
    .slice(0, 6);

  return (
    <aside className="hidden w-80 flex-shrink-0 flex-col gap-4 overflow-y-auto py-5 pr-5 sm:py-7 sm:pr-8 lg:flex">
      {/* 오늘 일정 */}
      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">오늘 일정</h3>
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            {label(todayStr)}
          </span>
        </div>
        {today.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            오늘 예정된 일정이 없습니다.
          </p>
        ) : (
          <div className="-mx-1 space-y-0.5">
            {today.map(i => (
              <EventRow key={i.original.id} item={i} onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>

      {/* 다가오는 일정 */}
      <section className="card p-4">
        <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">다가오는 일정</h3>
        {upcoming.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            예정된 일정이 없습니다.
          </p>
        ) : (
          <div className="-mx-1 space-y-0.5">
            {upcoming.map(i => (
              <EventRow key={i.original.id} item={i} onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

export default TodayRail;
