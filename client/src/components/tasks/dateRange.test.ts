// 일정 달력의 고르기 규칙. 테스트는 Asia/Seoul 로 돈다.

import { describe, expect, it } from 'vitest';
import {
  describeDraft,
  draftFrom,
  pickDay,
  pickDue,
  quickPicks,
  scheduleFrom,
  type Draft,
} from './dateRange';

const d = (day: number, month = 10) => new Date(2026, month - 1, day);
const empty: Draft = { start: null, end: null };

describe('pickDay', () => {
  it('처음 누르면 시작, 두 번째는 마감', () => {
    const first = pickDay(empty, d(12));
    expect(first).toEqual({ start: d(12), end: null });
    expect(pickDay(first, d(16))).toEqual({ start: d(12), end: d(16) });
  });

  it('시작보다 앞을 누르면 둘을 바꾼다', () => {
    expect(pickDay({ start: d(12), end: null }, d(9))).toEqual({ start: d(9), end: d(12) });
  });

  it('같은 날을 다시 누르면 하루짜리다', () => {
    expect(pickDay({ start: d(12), end: null }, d(12))).toEqual({ start: d(12), end: d(12) });
  });

  it('기간이 다 정해진 뒤 누르면 새로 고른다', () => {
    expect(pickDay({ start: d(12), end: d(16) }, d(20))).toEqual({ start: d(20), end: null });
  });
});

describe('pickDue (빠른 선택)', () => {
  it('마감을 정하고, 앞선 시작은 그대로 둔다', () => {
    expect(pickDue({ start: d(5), end: d(8) }, d(16))).toEqual({ start: d(5), end: d(16) });
  });

  it('시작이 그날보다 뒤면 그날 하루짜리로', () => {
    expect(pickDue({ start: d(20), end: d(25) }, d(16))).toEqual({ start: d(16), end: d(16) });
    expect(pickDue(empty, d(16))).toEqual({ start: d(16), end: d(16) });
  });
});

describe('quickPicks', () => {
  const dateOf = (today: Date, label: string) =>
    quickPicks(today).find(q => q.label === label)?.date;

  it('일요일 기준: 이번 주 금요일은 닷새 뒤, 다음 주 월요일은 내일', () => {
    const sunday = new Date(2026, 9, 11, 15, 0);
    expect(dateOf(sunday, '오늘')).toEqual(d(11));
    expect(dateOf(sunday, '내일')).toEqual(d(12));
    expect(dateOf(sunday, '이번 주 금요일')).toEqual(d(16));
    expect(dateOf(sunday, '다음 주 월요일')).toEqual(d(12));
    expect(dateOf(sunday, '1주 뒤')).toEqual(d(18));
  });

  it('금요일에 고른 이번 주 금요일은 오늘이다 — 다음 주로 넘기면 일주일이 밀린다', () => {
    const friday = new Date(2026, 9, 16, 9, 0);
    expect(dateOf(friday, '이번 주 금요일')).toEqual(d(16));
  });
});

describe('저장 값 ↔ 고른 값', () => {
  it('한쪽만 저장돼 있으면 그날 하루로 읽는다', () => {
    expect(draftFrom({ startDate: null, dueDate: '2026-10-16' })).toEqual({
      start: d(16),
      end: d(16),
    });
    expect(draftFrom({ startDate: null, dueDate: null })).toEqual(empty);
  });

  it('시작만 고르고 적용하면 하루짜리로 저장한다', () => {
    expect(scheduleFrom({ start: d(12), end: null })).toEqual({
      startDate: '2026-10-12',
      dueDate: '2026-10-12',
    });
  });

  it('저장 값은 두 날짜뿐이다', () => {
    expect(Object.keys(scheduleFrom({ start: d(12), end: d(16) }))).toEqual([
      'startDate',
      'dueDate',
    ]);
  });
});

describe('describeDraft', () => {
  const today = d(11);

  it('기간·일수·남은 날을 읽히게 적는다', () => {
    expect(describeDraft({ start: d(12), end: d(16) }, today)).toEqual({
      range: '10월 12일(월) ~ 10월 16일(금)',
      detail: '5일 · D-5',
    });
  });

  it('하루짜리와 지난 마감', () => {
    expect(describeDraft({ start: d(9), end: d(9) }, today)).toEqual({
      range: '10월 9일(금)',
      detail: '1일 · 2일 지남',
    });
  });

  it('고르지 않았으면 일정 미정', () => {
    expect(describeDraft(empty, today).range).toBe('일정 미정');
  });
});
