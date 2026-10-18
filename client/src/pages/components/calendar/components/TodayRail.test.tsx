// 레일이 반복 일정을 그릴 때 쓰는 열쇠.
//
// 반복은 한 규칙에서 여러 번째가 나오고, 번째들은 모두 같은 id 를 쓴다. 레일이
// id 만 열쇠로 쓰면 한 목록에 같은 열쇠가 여러 개 들어가, 데이터가 바뀌어도 React 가
// 옛 줄을 그대로 둔다.
//
// 실제로 그렇게 됐다: 반복을 끄고 저장하면 달력 격자는 바로 하루로 줄었는데
// 오른쪽 레일은 사라진 날짜들(10/19·10/20·10/21…)을 계속 보여 줬다. 새로고침해야
// 맞았다. 이 파일의 훅은 이미 occurrenceKey('id:날짜')를 쓰고 있었는데 레일만 빠져 있었다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TodayRail } from './TodayRail';
import type { CalendarEvent } from '../types';

vi.mock('./TodayTasks', () => ({ TodayTasks: () => null }));

const TODAY = '2026-10-18';

/** 같은 규칙에서 펼쳐진 번째들 — id 가 전부 같다. */
const occurrence = (date: string): CalendarEvent =>
  ({
    id: 7,
    calendarId: 'default',
    title: '매일 아침회의',
    isAllday: true,
    start: `${date}T00:00:00.000Z`,
    end: `${date}T00:00:00.000Z`,
    isReadOnly: false,
    UserId: 'u1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    isRecurringOccurrence: true,
    occurrenceDate: date,
  }) as CalendarEvent;

const renderRail = (events: CalendarEvent[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TodayRail events={events} todayStr={TODAY} onSelect={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const upcomingRows = () => screen.queryAllByRole('button', { name: /매일 아침회의/ });

describe('레일의 다가오는 일정', () => {
  it('반복의 번째를 여러 개 그린다', () => {
    renderRail(['2026-10-19', '2026-10-20', '2026-10-21'].map(occurrence));
    expect(upcomingRows()).toHaveLength(3);
  });

  it('번째가 사라지면 줄도 사라진다', () => {
    const { rerender } = renderRail(['2026-10-19', '2026-10-20', '2026-10-21'].map(occurrence));
    expect(upcomingRows()).toHaveLength(3);

    // 반복을 끄면 뒤의 번째들이 없어진다. 옛 줄이 남으면 안 된다.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TodayRail events={[occurrence('2026-10-19')]} todayStr={TODAY} onSelect={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(upcomingRows()).toHaveLength(1);
  });

  it('번째마다 열쇠가 다르다 — 같은 열쇠가 겹치면 React 가 옛 줄을 둔다', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRail(['2026-10-19', '2026-10-20', '2026-10-21'].map(occurrence));

    const duplicateKeyWarning = warn.mock.calls.find(args => String(args[0]).includes('same key'));
    expect(duplicateKeyWarning).toBeUndefined();
    warn.mockRestore();
  });
});
