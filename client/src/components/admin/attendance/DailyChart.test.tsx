// 날짜 슬롯이 기간과 정확히 맞는지. 달을 넘기는 계산은 눈으로는 안 보인다.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailyChart } from './DailyChart';
import type { AttendanceRecord } from '../../../types/attendance.types';

const rec = (workDate: string, workMinutes: number | null): AttendanceRecord =>
  ({
    id: Math.random(),
    userId: 'u1',
    workDate,
    checkInAt: `${workDate}T09:00:00.000Z`,
    checkOutAt: workMinutes === null ? null : `${workDate}T18:00:00.000Z`,
    workMinutes,
    note: null,
    checklist: [],
  }) as unknown as AttendanceRecord;

const slots = (container: HTMLElement) => container.querySelectorAll('[title]');

describe('DailyChart', () => {
  it('기록이 없는 날도 칸을 남긴다 — 빠진 날이 사라지면 안 된다', () => {
    const { container } = render(
      <DailyChart
        records={[rec('2026-03-02', 480)]}
        from="2026-03-01"
        to="2026-03-05"
        standardWorkMinutes={480}
      />
    );
    expect(slots(container)).toHaveLength(5);
    expect(screen.getByTitle(/03\.01.*기록 없음/)).toBeInTheDocument();
  });

  it('달을 넘겨도 날짜가 어긋나지 않는다', () => {
    const { container } = render(
      <DailyChart records={[]} from="2026-02-26" to="2026-03-02" standardWorkMinutes={480} />
    );
    // 2/26,27,28 + 3/1,2 = 5칸 (2026 년 2월은 28일까지)
    expect(slots(container)).toHaveLength(5);
  });

  it('퇴근을 안 찍은 날은 시간 대신 표시만 남긴다', () => {
    render(
      <DailyChart
        records={[rec('2026-03-01', null)]}
        from="2026-03-01"
        to="2026-03-03"
        standardWorkMinutes={480}
      />
    );
    expect(screen.getByTitle(/퇴근 안 찍음/)).toBeInTheDocument();
  });

  it('기준선이 천장에 붙지 않는다 — 테두리와 구분되어야 한다', () => {
    const { container } = render(
      <DailyChart
        records={[rec('2026-03-01', 480)]}
        from="2026-03-01"
        to="2026-03-03"
        standardWorkMinutes={480}
      />
    );
    const line = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    const bottom = Number.parseFloat(line.style.bottom);
    expect(bottom).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(100);
  });

  it('기간이 거꾸로면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <DailyChart records={[]} from="2026-03-10" to="2026-03-01" standardWorkMinutes={480} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
