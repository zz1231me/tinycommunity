import { describe, expect, it } from 'vitest';
import { toFormData } from './eventFormData';
import type { CalendarEvent } from './types';

const base = (over: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    id: 1,
    calendarId: 'default',
    title: '매일 회의',
    isAllday: false,
    start: '2026-11-02T01:00:00.000Z',
    end: '2026-11-02T02:00:00.000Z',
    isReadOnly: false,
    UserId: 'admin',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  }) as CalendarEvent;

describe('반복의 번째를 수정 창으로 옮길 때', () => {
  it('규칙의 시작을 채운다 — 그 번째의 날짜가 아니라', () => {
    // 11월 20일 번째를 눌러 연 창. start 는 그 날로 덮여 있다.
    const occurrence = base({
      start: '2026-11-20T01:00:00.000Z',
      end: '2026-11-20T02:00:00.000Z',
      isRecurringOccurrence: true,
      occurrenceDate: '2026-11-20',
      seriesStart: '2026-11-02T01:00:00.000Z',
      seriesEnd: '2026-11-02T02:00:00.000Z',
    });

    const form = toFormData(occurrence);

    // 여기서 20일이 채워지면, 제목만 바꿔 저장해도 규칙의 시작이 20일로 밀린다
    expect(form.start).toBe('2026-11-02');
  });

  it('보통 일정은 제 날짜 그대로다 — 양성 대조', () => {
    const form = toFormData(base());
    expect(form.start).toBe('2026-11-02');
  });

  it('규칙의 시작이 오지 않으면 가진 값을 쓴다', () => {
    // 서버가 아직 seriesStart 를 싣지 않던 때의 응답이 섞여도 창은 열려야 한다
    const form = toFormData(
      base({ isRecurringOccurrence: true, start: '2026-11-20T01:00:00.000Z' })
    );
    expect(form.start).toBe('2026-11-20');
  });
});
