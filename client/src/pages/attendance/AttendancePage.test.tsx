// 기준 시간을 못 채우고 퇴근을 누르면 한 번 더 묻는다.
//
// 퇴근은 10분 안에만 되돌릴 수 있어서, 잘못 누른 줄 모르고 지나가면 그날 기록이 그대로
// 굳는다. 그래서 모자랄 때만 확인을 끼운다 — 다 채웠으면 묻지 않는다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AttendanceStatus } from '../../types/attendance.types';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const checkOut = vi.fn();
const fetchMyAttendance = vi.fn();
vi.mock('../../api/attendance', () => ({
  checkIn: vi.fn(),
  checkOut: () => checkOut(),
  undoCheckOut: vi.fn(),
  fetchAttackState: vi.fn().mockResolvedValue({ now: new Date().toISOString(), queue: [] }),
  fetchMyAttendance: () => fetchMyAttendance(),
  fetchMyAttendanceHistory: vi.fn().mockResolvedValue({
    month: '2026-09',
    records: [],
    summary: { days: 0, totalMinutes: 0, averageMinutes: 0, openDays: 0, lastWorkDate: null },
    policy: {
      standardWorkMinutes: 480,
      requireChecklist: true,
      noticeText: '',
      checkInGraceMinutes: 0,
    },
  }),
}));
vi.mock('../../store/features', () => ({ useFeature: () => false }));
vi.mock('../../hooks/useNotificationArrival', () => ({ useNotificationArrival: () => {} }));
vi.mock('../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import AttendancePage from './AttendancePage';

const STANDARD = 480;

/** minutesWorked 분 전에 출근해 아직 퇴근하지 않은 상태 */
const statusWorking = (minutesWorked: number): AttendanceStatus => ({
  workDate: '2026-09-22',
  record: {
    id: 1,
    userId: 'admin',
    workDate: '2026-09-22',
    checkInAt: new Date(Date.now() - minutesWorked * 60_000).toISOString(),
    checkOutAt: null,
    workMinutes: null,
    note: '',
    checklist: [],
  },
  openPrevious: null,
  checklist: [],
  policy: {
    standardWorkMinutes: STANDARD,
    requireChecklist: true,
    noticeText: '',
    checkInGraceMinutes: 0,
  },
  undoCheckOutUntil: null,
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AttendancePage />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  checkOut.mockReset();
  checkOut.mockResolvedValue({ workDate: '2026-09-22', workMinutes: 120 });
});

describe('기준 시간 전에 퇴근을 누르면', () => {
  it('바로 찍지 않고 얼마나 모자란지 알려 주며 묻는다', async () => {
    fetchMyAttendance.mockResolvedValue(statusWorking(120));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '퇴근' }));

    expect(await screen.findByText(/모자랍니다/)).toBeInTheDocument();
    expect(screen.getByText(/6시간 모자랍니다/)).toBeInTheDocument();
    expect(checkOut).not.toHaveBeenCalled();
  });

  it('더 근무를 고르면 퇴근하지 않는다', async () => {
    fetchMyAttendance.mockResolvedValue(statusWorking(120));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '퇴근' }));
    fireEvent.click(await screen.findByRole('button', { name: '더 근무' }));

    await waitFor(() => expect(screen.queryByText(/모자랍니다/)).not.toBeInTheDocument());
    expect(checkOut).not.toHaveBeenCalled();
  });

  it('확인을 누르면 그때 찍는다', async () => {
    fetchMyAttendance.mockResolvedValue(statusWorking(120));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '퇴근' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '퇴근' }));

    await waitFor(() => expect(checkOut).toHaveBeenCalledTimes(1));
  });
});

describe('기준 시간을 채운 뒤 퇴근을 누르면', () => {
  it('묻지 않고 바로 찍는다', async () => {
    fetchMyAttendance.mockResolvedValue(statusWorking(STANDARD + 30));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '퇴근' }));

    await waitFor(() => expect(checkOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/모자랍니다/)).not.toBeInTheDocument();
  });
});
