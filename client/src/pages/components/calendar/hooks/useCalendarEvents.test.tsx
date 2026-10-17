// 달력을 열 때마다 /api/events 가 두 번 나가던 자리.
//
// 보이는 달(그리드)과 오른쪽 레일(오늘·다가오는 일정)이 각자 불렀다. 범위가 거의 겹치는데
// 저장·수정·삭제 때마다도 둘 다 다시 불러, 달력 한 번 쓰는 동안 같은 구간을 여러 번 물었다.
// 이제 한 번에 받되, 먼 달을 보는 중이라 범위가 몇 달로 벌어지면 그때만 나눠 받는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCalendarEvents, railWindow, RAIL_DAYS } from './useCalendarEvents';

const mockGetEvents = vi.fn();
const mockCreateEvent = vi.fn();
vi.mock('../../../../api/events', () => ({
  getEvents: (start: Date, end: Date) => mockGetEvents(start, end),
  createEvent: (e: unknown) => mockCreateEvent(e),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('../../../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const event = (id: number, start: string, end: string) => ({
  id,
  calendarId: 'default',
  title: `일정${id}`,
  isAllday: true,
  start,
  end,
  isReadOnly: false,
});

/** FullCalendar 대신 보이는 범위만 흉내 낸다 */
const calendarRef = (activeStart: Date, activeEnd: Date) =>
  ({
    current: { getApi: () => ({ view: { activeStart, activeEnd } }) },
  }) as unknown as React.RefObject<unknown>;

const show = (from: Date, to: Date) =>
  renderHook(() =>
    useCalendarEvents({
      userId: 'me',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      calendarRef: calendarRef(from, to) as any,
    })
  );

const day = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEvents.mockResolvedValue([]);
});

describe('보이는 달과 레일을 한 번에 받는다', () => {
  it('요청은 한 번이고, 범위가 둘을 모두 덮는다', async () => {
    const { result } = show(day(-10), day(20)); // 이번 달 그리드
    await act(async () => {
      await result.current.loadEvents();
    });

    expect(mockGetEvents).toHaveBeenCalledTimes(1);
    const [start, end] = mockGetEvents.mock.calls[0];
    const rail = railWindow();
    expect(start.getTime()).toBeLessThanOrEqual(day(-10).getTime());
    expect(start.getTime()).toBeLessThanOrEqual(rail.start.getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(day(20).getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(rail.end.getTime());
  });

  it('레일 창은 오늘부터 31일이다 — 보이는 달이 좁아도 그만큼은 받는다', async () => {
    const { result } = show(day(0), day(3)); // 주간처럼 좁은 범위
    await act(async () => {
      await result.current.loadEvents();
    });

    const [, end] = mockGetEvents.mock.calls[0];
    expect(Math.round((end.getTime() - day(0).getTime()) / 86_400_000)).toBe(RAIL_DAYS);
  });

  it('받아 온 모양 그대로도 내보낸다 — 레일이 오늘 기준으로 고를 수 있게', async () => {
    mockGetEvents.mockResolvedValue([event(1, day(1).toISOString(), day(2).toISOString())]);
    const { result } = show(day(-10), day(20));
    await act(async () => {
      await result.current.loadEvents();
    });

    await waitFor(() => expect(result.current.rawEvents).toHaveLength(1));
    expect(result.current.rawEvents[0].id).toBe(1);
    expect(result.current.events[0].id).toBe('1'); // 달력용은 FullCalendar 모양
  });

  it('일정을 저장한 뒤에도 한 번만 묻는다', async () => {
    const { result } = show(day(-10), day(20));
    await act(async () => {
      await result.current.handleCreateEvent({
        title: 'ㅇ',
        start: '2026-10-11',
        end: '2026-10-11',
        category: 'meeting',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    expect(mockGetEvents).toHaveBeenCalledTimes(1);
  });
});

describe('먼 달을 보는 중이면', () => {
  it('합치지 않고 둘로 나눠 받는다 — 몇 달치를 한꺼번에 끌어오지 않게', async () => {
    const { result } = show(day(300), day(330));
    await act(async () => {
      await result.current.loadEvents();
    });

    expect(mockGetEvents).toHaveBeenCalledTimes(2);
    const spans = mockGetEvents.mock.calls.map(([s, e]) =>
      Math.round((e.getTime() - s.getTime()) / 86_400_000)
    );
    expect(Math.max(...spans)).toBeLessThanOrEqual(RAIL_DAYS + 1); // 둘 다 한 달 남짓
  });

  it('두 범위에 함께 든 일정이 두 번 들어오지 않는다', async () => {
    const shared = event(7, day(1).toISOString(), day(2).toISOString());
    mockGetEvents.mockResolvedValue([shared]);
    const { result } = show(day(300), day(330));
    await act(async () => {
      await result.current.loadEvents();
    });

    await waitFor(() => expect(result.current.rawEvents).toHaveLength(1));
    expect(result.current.events).toHaveLength(1);
  });
});

// 반복 일정은 서버가 규칙을 펼쳐서 '번째' 들을 준다. 한 id 에서 여러 건이 오므로
// 겹친 범위를 걷을 때 id 만 보면 한 달치가 한 건으로 줄어든다.
describe('반복 일정의 번째들', () => {
  const occurrence = (id: number, date: string) => ({
    ...event(id, `${date}T01:00:00.000Z`, `${date}T02:00:00.000Z`),
    occurrenceDate: date,
    isRecurringOccurrence: true,
    UserId: 'me',
  });

  it('같은 id 라도 날짜가 다르면 따로 센다', async () => {
    mockGetEvents.mockResolvedValue([
      occurrence(7, '2026-11-02'),
      occurrence(7, '2026-11-09'),
      occurrence(7, '2026-11-16'),
    ]);
    const { result } = show(day(300), day(330));
    await act(async () => {
      await result.current.loadEvents();
    });

    await waitFor(() => expect(result.current.events).toHaveLength(3));
    expect(result.current.events.map(e => e.id)).toEqual([
      '7:2026-11-02',
      '7:2026-11-09',
      '7:2026-11-16',
    ]);
  });

  it('번째는 끌어 옮기지 못한다 — 한 번째만 옮기는 규칙이 없다', async () => {
    mockGetEvents.mockResolvedValue([occurrence(7, '2026-11-02')]);
    const { result } = show(day(1), day(20));
    await act(async () => {
      await result.current.loadEvents();
    });

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].editable).toBe(false);
  });

  it('반복이 아닌 일정은 그대로 끌 수 있다 — 대조', async () => {
    mockGetEvents.mockResolvedValue([
      { ...event(8, day(1).toISOString(), day(2).toISOString()), UserId: 'me' },
    ]);
    const { result } = show(day(1), day(20));
    await act(async () => {
      await result.current.loadEvents();
    });

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].editable).toBe(true);
    expect(result.current.events[0].id).toBe('8');
  });
});
