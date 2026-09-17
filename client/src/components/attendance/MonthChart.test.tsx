// 내 근무 그래프가 값을 정확히 그리고, 보조기기에도 전하는지.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthChart } from './MonthChart';
import type { AttendanceRecord } from '../../types/attendance.types';

const rec = (workDate: string, workMinutes: number | null): AttendanceRecord =>
  ({
    id: Math.random(),
    workDate,
    checkInAt: `${workDate}T09:00:00.000Z`,
    checkOutAt: workMinutes === null ? null : `${workDate}T18:00:00.000Z`,
    workMinutes,
    checklist: [],
    note: null,
  }) as unknown as AttendanceRecord;

const render31 = (records: AttendanceRecord[], live = '2026-03-31') =>
  render(
    <MonthChart month="2026-03" records={records} standardWorkMinutes={480} liveWorkDate={live} />
  );

describe('내 근무 그래프', () => {
  it('그 달의 날 수만큼 칸을 만든다', () => {
    const { container } = render31([rec('2026-03-02', 480)]);
    expect(container.querySelectorAll('[title]')).toHaveLength(31);
  });

  it('기준선이 천장에 붙지 않는다 — 테두리와 구분되어야 한다', () => {
    const { container } = render31([rec('2026-03-02', 480)]);
    const line = container.querySelector('[aria-hidden="true"] .absolute') as HTMLElement;
    const bottom = Number.parseFloat(line.style.bottom);
    expect(bottom).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(100);
  });

  it('기준 시간을 글로도 알려준다', () => {
    render31([rec('2026-03-02', 480)]);
    expect(screen.getByText(/점선 = 기준/)).toBeInTheDocument();
  });

  it('퇴근을 안 찍은 지난 날과 근무 중인 오늘을 구분한다', () => {
    render31([rec('2026-03-02', null), rec('2026-03-31', null)], '2026-03-31');
    expect(screen.getByTitle(/^2일\(.\) · 퇴근 안 찍음$/)).toBeInTheDocument();
    expect(screen.getByTitle(/^31일\(.\) · 근무 중$/)).toBeInTheDocument();
  });

  it('기록이 없는 날도 칸을 남긴다', () => {
    render31([rec('2026-03-02', 480)]);
    expect(screen.getByTitle(/^1일\(.\) · 기록 없음$/)).toBeInTheDocument();
  });

  it('낭독기에는 기록이 있는 날의 값을 글로 전한다', () => {
    render31([rec('2026-03-02', 480)]);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('8시간');
  });

  it('요일을 함께 알려준다 — 주 단위가 읽히도록', () => {
    render31([rec('2026-03-07', 300)]);
    // 2026-03-07 은 토요일
    expect(screen.getByTitle(/^7일\(토\) · /)).toBeInTheDocument();
  });
});
