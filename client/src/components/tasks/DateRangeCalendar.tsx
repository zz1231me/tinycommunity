// 업무 일정 달력. 시작일과 마감일을 한 달력에서 두 번 눌러 고르고, '적용' 할 때 한 번만 저장한다.
//
// 브라우저 기본 날짜 칸을 쓰지 않는 이유:
//  - 칸이 연·월·일로 쪼개져 누르는 자리마다 입력이 달라지고 달력이 작다.
//  - 연도를 치는 동안 0002년·0020년·0202년이 하나씩 '바뀐 값' 으로 나가 그때마다 저장됐다.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Schedule } from './taskViews';
import {
  describeDraft,
  draftFrom,
  pickDay,
  pickDue,
  quickPicks,
  scheduleFrom,
  type Draft,
} from './dateRange';
import { useToday } from '../../hooks/useToday';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  value: Schedule;
  onApply: (schedule: Schedule) => void;
  onCancel: () => void;
  /** 저장된 일정이 있을 때만 보인다. 지우기는 부른 쪽이 한 번 더 묻는다. */
  onClear?: () => void;
  /** 처음 열었을 때 첫 날짜 단추로 포커스를 옮길지 */
  autoFocus?: boolean;
}

export function DateRangeCalendar({ value, onApply, onCancel, onClear, autoFocus = false }: Props) {
  const today = useToday();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(value));
  // 키보드로 움직이는 칸. 보이는 달도 이 날짜를 따라간다.
  const [focused, setFocused] = useState<Date>(() => draftFrom(value).start ?? today);
  const [month, setMonth] = useState<Date>(() => startOfMonth(focused));
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(autoFocus);

  // 키보드로 옮긴 칸에 실제 포커스를 준다. 마우스로 누를 때는 이미 그 칸에 포커스가 있다.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${format(focused, 'yyyy-MM-dd')}"]`)
      ?.focus();
  }, [focused, month]);

  const days = useMemo(() => {
    const first = startOfWeek(month);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [month]);

  const goTo = (day: Date, viaKeyboard = true) => {
    setFocused(day);
    if (!isSameMonth(day, month)) setMonth(startOfMonth(day));
    moveFocus.current = viaKeyboard;
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in step) {
      e.preventDefault();
      goTo(addDays(focused, step[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      goTo(addMonths(focused, e.key === 'PageUp' ? -1 : 1));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      goTo(addDays(focused, e.key === 'Home' ? -focused.getDay() : 6 - focused.getDay()));
    }
  };

  const summary = describeDraft(draft, today);
  const end = draft.end ?? draft.start;
  const hasSaved = Boolean(value.startDate || value.dueDate);

  return (
    <div className="w-[17.5rem] space-y-2" aria-label="일정 고르기" role="group">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
            aria-live="polite"
          >
            {summary.range}
          </span>
          <span className="flex-shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {summary.detail}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          {!draft.start
            ? '시작일을 누르세요'
            : !draft.end
              ? '마감일을 누르세요 (같은 날을 다시 누르면 하루)'
              : '다른 날을 누르면 새로 고릅니다'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {quickPicks(today).map(q => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              setDraft(d => pickDue(d, q.date));
              goTo(q.date, false);
            }}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => setMonth(m => addMonths(m, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {format(month, 'yyyy년 M월')}
        </span>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => setMonth(m => addMonths(m, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div ref={gridRef} onKeyDown={onGridKey}>
        <div className="grid grid-cols-7 text-center text-2xs text-slate-400" aria-hidden="true">
          {WEEKDAYS.map(w => (
            <span key={w} className="py-1">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {days.map(day => {
            if (!isSameMonth(day, month)) return <span key={day.getTime()} />;
            const inRange = draft.start && end && day >= draft.start && day <= end;
            const isEdge =
              (draft.start && isSameDay(day, draft.start)) || (end && isSameDay(day, end));
            const isToday = isSameDay(day, today);
            const weekday = day.getDay();
            return (
              <button
                key={day.getTime()}
                type="button"
                data-day={format(day, 'yyyy-MM-dd')}
                tabIndex={isSameDay(day, focused) ? 0 : -1}
                aria-label={format(day, 'yyyy년 M월 d일 EEEE', { locale: ko })}
                aria-pressed={Boolean(isEdge)}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => {
                  setDraft(d => pickDay(d, day));
                  goTo(day, false);
                }}
                className={`h-9 text-sm tabular-nums transition-colors ${
                  isEdge
                    ? 'rounded-md bg-primary-600 font-semibold text-white'
                    : inRange
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200'
                      : `rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 ${
                          weekday === 0
                            ? 'text-rose-500'
                            : weekday === 6
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-slate-700 dark:text-slate-200'
                        }`
                } ${isToday && !isEdge ? 'rounded-md ring-1 ring-inset ring-primary-400' : ''}`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
        {hasSaved && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-slate-500 hover:text-rose-600 hover:underline dark:text-slate-400"
          >
            일정 지우기
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-1.5">
          <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1 text-xs">
            취소
          </button>
          <button
            type="button"
            onClick={() => onApply(scheduleFrom(draft))}
            disabled={!draft.start}
            title={draft.start ? undefined : '날짜를 먼저 고르세요'}
            className="btn-primary px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
