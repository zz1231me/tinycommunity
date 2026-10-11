// 일정 달력의 고르기 규칙. 화면과 떼어 두어 따로 시험한다.
// 날짜는 모두 현지 0시 Date 로 다루고, 저장할 때만 'YYYY-MM-DD' 로 바꾼다.

import {
  addDays,
  differenceInCalendarDays,
  format,
  nextFriday,
  nextMonday,
  parseISO,
  startOfDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Schedule } from './taskViews';

export interface Draft {
  start: Date | null;
  /** null 이면 아직 마감을 고르는 중이다(시작만 고른 상태) */
  end: Date | null;
}

export function draftFrom(schedule: Schedule): Draft {
  const first = schedule.startDate ?? schedule.dueDate;
  const last = schedule.dueDate ?? schedule.startDate;
  return {
    start: first ? parseISO(first) : null,
    end: last ? parseISO(last) : null,
  };
}

/** 저장할 값. 시작만 골랐으면 그날 하루짜리다. */
export function scheduleFrom(draft: Draft): Schedule {
  if (!draft.start) return { startDate: null, dueDate: null };
  const end = draft.end ?? draft.start;
  return { startDate: format(draft.start, 'yyyy-MM-dd'), dueDate: format(end, 'yyyy-MM-dd') };
}

/**
 * 달력에서 하루를 눌렀을 때. 처음 누르면 시작, 두 번째로 누르면 마감이다.
 * 시작보다 앞을 누르면 둘을 바꾼다. 기간이 다 정해진 뒤 누르면 새로 고른다.
 */
export function pickDay(draft: Draft, day: Date): Draft {
  if (!draft.start || draft.end) return { start: day, end: null };
  if (day < draft.start) return { start: day, end: draft.start };
  return { start: draft.start, end: day };
}

/**
 * 빠른 선택은 마감을 정한다. 대개 '언제까지' 를 고르는 것이라서다.
 * 이미 고른 시작이 그날 이전이면 시작은 그대로 두고, 아니면 그날 하루짜리로 한다.
 */
export function pickDue(draft: Draft, day: Date): Draft {
  const keepStart = draft.start && draft.start <= day;
  return { start: keepStart ? draft.start : day, end: day };
}

export interface QuickPick {
  label: string;
  date: Date;
}

export function quickPicks(today: Date): QuickPick[] {
  const base = startOfDay(today);
  return [
    { label: '오늘', date: base },
    { label: '내일', date: addDays(base, 1) },
    // 오늘이 금요일이면 '이번 주 금요일' 은 오늘이다
    { label: '이번 주 금요일', date: base.getDay() === 5 ? base : nextFriday(base) },
    { label: '다음 주 월요일', date: nextMonday(base) },
    { label: '1주 뒤', date: addDays(base, 7) },
  ];
}

export function formatDay(d: Date): string {
  return format(d, 'M월 d일(EEE)', { locale: ko });
}

/** '10월 12일(월) ~ 10월 16일(금)' 과 '5일 · D-5' */
export function describeDraft(draft: Draft, today: Date): { range: string; detail: string } {
  if (!draft.start) return { range: '일정 미정', detail: '' };
  const end = draft.end ?? draft.start;
  const range =
    end.getTime() === draft.start.getTime()
      ? formatDay(draft.start)
      : `${formatDay(draft.start)} ~ ${formatDay(end)}`;
  const length = differenceInCalendarDays(end, draft.start) + 1;
  const left = differenceInCalendarDays(end, today);
  const due = left < 0 ? `${-left}일 지남` : left === 0 ? 'D-day' : `D-${left}`;
  return { range, detail: `${length}일 · ${due}` };
}
