// 캘린더 우측 레일. 오늘 할 일(마감 지남·오늘 마감)과 오늘·다가오는 일정을 보여준다(넓은 화면 전용).
//
// xl(1280) 부터 편다. 폭이 320px 로 고정이라 lg(1024) 에서 펴면 달력이 382px 만 쓰게 되고,
// 날짜 칸이 좁아져 일정 이름이 두 글자만 남는다(실측: 108px 짜리 이름에 31px).
// 보이는 달과 무관하게 오늘 기준으로 표시하려고 CalendarEvent[] 를 직접 받는다.
import { CalendarEvent } from '../types';
import { categoryColors } from '../constants';
import { DEFAULT_EVENT_COLOR } from '../../../../constants/colors';
import { dateUtils } from '../utils';
import { occurrenceKey } from '../hooks/useCalendarEvents';
import { ListState } from '../../../../components/common/ListState';
import { TodayTasks } from './TodayTasks';

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
  endD: string; // 포함되는 마지막 날. allDay 종료는 배타적이라 하루 뺀다.
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
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <span
        className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: item.color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
          {item.title}
        </span>
        <span className="mt-0.5 block text-xs text-slate-400">
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
    <aside className="hidden w-80 flex-shrink-0 flex-col gap-4 overflow-y-auto py-4 pr-4 sm:py-6 sm:pr-6 xl:flex">
      {/* 오늘 마감인 내 업무가 맨 위다 — 일정보다 먼저 손이 가야 하는 쪽이다.
          없으면 아예 그리지 않는다. */}
      <TodayTasks />

      {/* 오늘 일정 */}
      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">오늘 일정</h3>
          <span className="text-xs font-medium text-slate-400">{label(todayStr)}</span>
        </div>
        {today.length === 0 ? (
          <ListState>오늘 예정된 일정이 없습니다.</ListState>
        ) : (
          <div className="-mx-1 space-y-0.5">
            {today.map(i => (
              <EventRow key={occurrenceKey(i.original)} item={i} onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>

      {/* 다가오는 일정 */}
      <section className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
          다가오는 일정
        </h3>
        {upcoming.length === 0 ? (
          <ListState>예정된 일정이 없습니다.</ListState>
        ) : (
          <div className="-mx-1 space-y-0.5">
            {upcoming.map(i => (
              // 반복의 번째들은 id 가 같다. id 만 쓰면 한 목록에 같은 열쇠가 겹쳐,
              // 데이터가 바뀌어도 React 가 옛 줄을 그대로 둔다.
              <EventRow key={occurrenceKey(i.original)} item={i} onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
