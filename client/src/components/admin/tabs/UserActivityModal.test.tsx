// client/src/components/admin/tabs/UserActivityModal.test.tsx
// '거부된 시도' 탭 — 한 사용자가 무엇을 시도하다 막혔는지 한자리에서 본다.
//
// 이게 없으면 조사하려는 사람이 에러 로그 화면으로 옮겨 가 사용자 ID 를 손으로 쳐야 했다.
// 여기서 고정하는 것은 셋이다.
//   1. 탭을 열면 그 사용자로 걸러서 조회한다 (userId 가 빠지면 남의 기록까지 보인다)
//   2. 탭을 열기 전에는 조회하지 않는다 (모달을 띄우기만 해도 로그를 긁으면 안 된다)
//   3. 받은 행을 그대로 보여 준다

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { UserActivityModal } from './UserActivityModal';

const mockFetchErrorLogs = vi.fn();

// vi.mock 은 모듈을 통째로 바꾼다 — 모달이 import 하는 함수를 하나라도 빠뜨리면
// 탭과 무관한 곳에서 undefined 로 터진다.
vi.mock('../../../api/admin', () => ({
  fetchUserLoginHistory: () => Promise.resolve({ records: [], total: 0, totalPages: 1 }),
  fetchUserAuditLogs: () => Promise.resolve({ logs: [], total: 0, totalPages: 1 }),
  fetchUserSessions: () => Promise.resolve([]),
  forceLogoutSession: () => Promise.resolve({}),
  fetchErrorLogs: (params: unknown) => mockFetchErrorLogs(params),
}));

const attempt = {
  id: 'e1',
  createdAt: '2026-09-16T01:00:00.000Z',
  method: 'GET',
  route: '/api/admin/users',
  errorCode: 'HTTP_403',
  severity: 'warning',
  errorMessage: '권한 없는 접근 시도: 관리자만 가능합니다.',
  requestBody: { ip: '10.0.0.7' },
};

const openTab = () => fireEvent.click(screen.getByRole('button', { name: '거부된 시도' }));

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchErrorLogs.mockResolvedValue({
    logs: [attempt],
    pagination: { total: 1, page: 1, limit: 15, totalPages: 1 },
  });
});

describe('UserActivityModal — 거부된 시도', () => {
  it('탭을 열면 그 사용자 것만 조회한다', async () => {
    renderWithQuery(<UserActivityModal userId="testuser" userName="테스트" onClose={() => {}} />);
    openTab();

    await waitFor(() => expect(mockFetchErrorLogs).toHaveBeenCalled());
    expect(mockFetchErrorLogs).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'testuser' })
    );
  });

  it('탭을 열기 전에는 조회하지 않는다 — 음성 대조', async () => {
    renderWithQuery(<UserActivityModal userId="testuser" userName="테스트" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '거부된 시도' })).toBeVisible());
    expect(mockFetchErrorLogs).not.toHaveBeenCalled();
  });

  it('받은 시도를 행으로 보여 준다', async () => {
    renderWithQuery(<UserActivityModal userId="testuser" userName="테스트" onClose={() => {}} />);
    openTab();

    expect(await screen.findByText('HTTP_403')).toBeInTheDocument();
    expect(screen.getByText('GET /api/admin/users')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.7')).toBeInTheDocument();
  });

  it('없으면 비었다고 알린다', async () => {
    mockFetchErrorLogs.mockResolvedValue({
      logs: [],
      pagination: { total: 0, page: 1, limit: 15, totalPages: 1 },
    });
    renderWithQuery(<UserActivityModal userId="testuser" userName="테스트" onClose={() => {}} />);
    openTab();

    expect(await screen.findByText('거부된 시도가 없습니다.')).toBeInTheDocument();
  });

  // 보안 화면에서 "못 불러왔다" 와 "기록이 깨끗하다" 가 같아 보이면 판단을 그르친다.
  it('조회가 실패하면 없음이 아니라 실패했다고 알린다', async () => {
    mockFetchErrorLogs.mockRejectedValue(new Error('network down'));
    renderWithQuery(<UserActivityModal userId="testuser" userName="테스트" onClose={() => {}} />);
    openTab();

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByText('거부된 시도가 없습니다.')).not.toBeInTheDocument();
  });
});
