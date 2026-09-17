// client/src/components/admin/tabs/ErrorLogManagement.test.tsx
// 에러 로그 탭은 다른 로그 탭과 달리 VirtualLogTable 을 쓰지 않고 표를 직접 그린다.
// 그래서 공용 경로를 덮는 LoginHistoryManagement 테스트가 이 화면을 덮지 못한다 —
// '조회 실패를 빈 목록으로 보여주는' 문제도 여기서는 따로 확인해야 한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { ErrorLogManagement } from './ErrorLogManagement';

const mockFetchErrorLogs = vi.fn();
const mockDeleteErrorLogs = vi.fn();

// vi.mock 은 모듈을 통째로 바꾼다 — 이 화면이 import 하는 둘을 모두 넣어야 한다.
vi.mock('../../../api/admin', () => ({
  fetchErrorLogs: (params: unknown, signal: unknown) => mockFetchErrorLogs(params, signal),
  deleteErrorLogs: (options: unknown) => mockDeleteErrorLogs(options),
}));

const log = {
  id: 'e1',
  userId: 'admin',
  userName: '관리자',
  route: '/api/admin/users',
  method: 'GET',
  errorCode: 'HTTP_401',
  errorMessage: '인증 없는 접근 시도',
  severity: 'warning' as const,
  requestBody: { ip: '10.0.0.7' },
  createdAt: '2026-09-16T01:00:00.000Z',
};

const page = (logs: unknown[], overrides: Record<string, unknown> = {}) => ({
  logs,
  pagination: { total: logs.length, page: 1, limit: 20, totalPages: 1, ...overrides },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ErrorLogManagement', () => {
  it('불러온 기록을 행으로 렌더한다', async () => {
    mockFetchErrorLogs.mockResolvedValue(page([log]));

    renderWithQuery(<ErrorLogManagement />);

    expect(await screen.findByText('HTTP_401')).toBeInTheDocument();
    expect(screen.getByText('/api/admin/users')).toBeInTheDocument();
  });

  it('기록이 없으면 빈 안내를 보여준다', async () => {
    mockFetchErrorLogs.mockResolvedValue(page([]));

    renderWithQuery(<ErrorLogManagement />);

    expect(await screen.findByText('에러 로그가 없습니다.')).toBeInTheDocument();
  });

  it('조회가 실패하면 빈 안내가 아니라 실패를 알린다', async () => {
    mockFetchErrorLogs.mockRejectedValue(new Error('network down'));

    renderWithQuery(<ErrorLogManagement />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByText('에러 로그가 없습니다.')).not.toBeInTheDocument();
  });
});
