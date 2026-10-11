// 기준 시간을 못 채우고 퇴근을 누르면 한 번 더 묻는다.
//
// 퇴근은 10분 안에만 되돌릴 수 있어서, 잘못 누른 줄 모르고 지나가면 그날 기록이 그대로
// 굳는다. 그래서 모자랄 때만 확인을 끼운다 — 다 채웠으면 묻지 않는다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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
      undoMinutes: 10,
    },
  }),
}));
vi.mock('../../store/features', () => ({ useFeature: () => false }));
// 도착 신호를 테스트에서 직접 쏠 수 있게 보관한다
const arrivalHandlers: Array<{ types: unknown; cb: () => void }> = [];
vi.mock('../../hooks/useNotificationArrival', () => ({
  useNotificationArrival: (types: unknown, cb: () => void) => {
    arrivalHandlers.push({ types, cb });
  },
}));
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
    undoMinutes: 10,
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

// 출근·퇴근은 휴대폰이나 다른 탭에서도 찍는다. 그렇게 찍고 이 화면으로 돌아왔을 때
// '출근 전' 인 채로 남아 있으면, 공격이 와도 근무 중이 아닌 줄 알고 아무 표시도 하지 않는다
// (실제로 그렇게 됐다 — 공격을 산 사람은 포인트만 쓰고 상대 화면은 멀쩡했다).
describe('다른 곳에서 찍은 출근을 따라잡는다', () => {
  it('탭으로 돌아오면 오늘 상태를 다시 읽는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fetchMyAttendance.mockResolvedValue(statusWorking(120));
      renderPage();
      await waitFor(() => expect(fetchMyAttendance).toHaveBeenCalledTimes(1));

      // 30초가 지나야 '묵은' 것으로 본다. 그 전에는 돌아와도 묻지 않는다.
      await act(async () => {
        window.dispatchEvent(new Event('visibilitychange'));
      });
      expect(fetchMyAttendance).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(31_000);
      });
      await act(async () => {
        window.dispatchEvent(new Event('visibilitychange'));
      });

      await waitFor(() => expect(fetchMyAttendance).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it('공격 알림이 오면 공격 상태와 함께 오늘 상태도 읽는다', async () => {
    fetchMyAttendance.mockResolvedValue(statusWorking(120));
    arrivalHandlers.length = 0;
    renderPage();
    await waitFor(() => expect(fetchMyAttendance).toHaveBeenCalledTimes(1));

    const attack = arrivalHandlers.find(h => Array.isArray(h.types) && h.types.includes('ATTACK'));
    expect(attack).toBeTruthy();
    await act(async () => {
      attack!.cb();
    });

    await waitFor(() => expect(fetchMyAttendance).toHaveBeenCalledTimes(2));
  });
});
