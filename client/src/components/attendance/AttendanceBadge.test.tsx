// client/src/components/attendance/AttendanceBadge.test.tsx
// 헤더 출근 아이콘 — 언제 깜빡이고 언제 조용해야 하는가.
//
// 깜빡임은 "아직 안 찍었다" 는 신호다. 신호가 틀리면 둘 중 하나로 해롭다 —
// 이미 찍은 사람에게 깜빡이면 헤더에서 계속 거슬리고, 안 찍은 사람에게 조용하면
// 아이콘을 둔 이유가 사라진다. 그래서 상태별로 하나씩 고정한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { AttendanceBadge } from './AttendanceBadge';
import { useAuth } from '../../store/auth';
import { useFeatures } from '../../store/features';
import type { AttendanceStatus, AttendanceRecord } from '../../types/attendance.types';

const mockFetchMyAttendance = vi.fn();
vi.mock('../../api/attendance', () => ({
  fetchMyAttendance: () => mockFetchMyAttendance(),
}));

const record = (over: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  id: 1,
  userId: 'admin',
  workDate: '2026-09-17',
  checkInAt: '2026-09-17T00:10:00.000Z',
  checkOutAt: null,
  workMinutes: null,
  note: '',
  checklist: [],
  ...over,
});

const status = (over: Partial<AttendanceStatus> = {}): AttendanceStatus => ({
  workDate: '2026-09-17',
  record: null,
  openPrevious: null,
  undoCheckOutUntil: null,
  checklist: [],
  policy: {
    standardWorkMinutes: 480,
    requireChecklist: false,
    noticeText: '',
    checkInGraceMinutes: 0,
  },
  ...over,
});

const show = () =>
  renderWithQuery(
    <MemoryRouter>
      <AttendanceBadge />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.setState({ isAuthenticated: true });
  useFeatures.setState({ features: { 'tools.attendance': true }, loaded: true });
});

describe('보여줄지 말지', () => {
  it('출퇴근 기능이 꺼져 있으면 아무것도 그리지 않는다', () => {
    useFeatures.setState({ features: { 'tools.attendance': false }, loaded: true });
    mockFetchMyAttendance.mockResolvedValue(status());

    const { container } = show();

    expect(container).toBeEmptyDOMElement();
    expect(mockFetchMyAttendance).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 그리지도 묻지도 않는다', () => {
    useAuth.setState({ isAuthenticated: false });
    mockFetchMyAttendance.mockResolvedValue(status());

    const { container } = show();

    expect(container).toBeEmptyDOMElement();
    expect(mockFetchMyAttendance).not.toHaveBeenCalled();
  });

  it('출퇴근 화면으로 보낸다', async () => {
    mockFetchMyAttendance.mockResolvedValue(status({ record: record() }));

    show();

    const link = await screen.findByRole('link', { name: /출근 확인/ });
    expect(link).toHaveAttribute('href', '/dashboard/attendance');
  });
});

// motion-safe: 접두사가 붙으면 DOM 클래스는 'motion-safe:animate-pulse' 한 덩어리다.
// '.animate-pulse' 로 찾으면 아무것도 안 잡혀서, 깜빡이는데도 '안 깜빡인다' 가 통과한다.
describe('언제 깜빡이는가', () => {
  it('오늘 기록이 없으면 깜빡인다', async () => {
    mockFetchMyAttendance.mockResolvedValue(status({ record: null }));

    const { container } = show();

    await screen.findByRole('link', { name: /아직 출근을 찍지 않았습니다/ });
    expect(container.querySelector('[class*="animate-pulse"]')).not.toBeNull();
  });

  it('근무 중이면 깜빡이지 않는다', async () => {
    mockFetchMyAttendance.mockResolvedValue(status({ record: record() }));

    const { container } = show();

    await screen.findByRole('link', { name: /근무 중/ });
    expect(container.querySelector('[class*="animate-pulse"]')).toBeNull();
  });

  it('퇴근까지 찍었으면 깜빡이지 않는다', async () => {
    mockFetchMyAttendance.mockResolvedValue(
      status({ record: record({ checkOutAt: '2026-09-17T09:00:00.000Z', workMinutes: 480 }) })
    );

    const { container } = show();

    await screen.findByRole('link', { name: /퇴근 완료/ });
    expect(container.querySelector('[class*="animate-pulse"]')).toBeNull();
  });

  it('어제 미마감 기록이 있어도 오늘 안 찍었으면 깜빡인다', async () => {
    // reminderRule 과 같은 판단 — 어제 것을 오늘 출근으로 세지 않는다
    mockFetchMyAttendance.mockResolvedValue(
      status({ record: null, openPrevious: record({ workDate: '2026-09-16' }) })
    );

    const { container } = show();

    await screen.findByRole('link', { name: /아직 출근을 찍지 않았습니다/ });
    expect(container.querySelector('[class*="animate-pulse"]')).not.toBeNull();
  });

  it('아직 못 받았을 때는 깜빡이지 않는다 — 모르는 상태의 허위 경보 방지', () => {
    // 응답을 끝내지 않는다 = 로딩 상태 그대로
    mockFetchMyAttendance.mockReturnValue(new Promise(() => {}));

    const { container } = show();

    expect(screen.getByRole('link', { name: '출근 확인' })).toBeInTheDocument();
    expect(container.querySelector('[class*="animate-pulse"]')).toBeNull();
  });
});
