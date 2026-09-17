// client/src/components/admin/tabs/LoginHistoryManagement.test.tsx
// 로그 탭 4종이 공유하게 된 useAdminLogQuery + VirtualLogTable + LogFilterBar 조합을
// 대표로 한 탭에서 통합 검증한다. (필터→쿼리 파라미터 반영, 페이지 이동, 빈 목록)

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import { LoginHistoryManagement } from './LoginHistoryManagement';

const mockFetchLoginHistory = vi.fn();

vi.mock('../../../api/admin', () => ({
  fetchLoginHistory: (params: unknown, signal: unknown) => mockFetchLoginHistory(params, signal),
}));

function page(records: unknown[], overrides: Record<string, unknown> = {}) {
  return { records, total: records.length, totalPages: 1, ...overrides };
}

const record = {
  id: '1',
  userId: 'admin',
  userName: '관리자',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  status: 'success',
  failureReason: null,
  createdAt: '2026-09-06T01:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginHistoryManagement', () => {
  it('불러온 기록을 행으로 렌더한다', async () => {
    mockFetchLoginHistory.mockResolvedValue(page([record]));

    renderWithQuery(<LoginHistoryManagement />);

    expect(await screen.findByText('관리자')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
    // '성공' 은 상태 필터의 <option> 에도 있으므로 행 안의 뱃지만 집어서 확인한다
    expect(screen.getByText('Mozilla/5.0')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '성공' })).toBeInTheDocument();
  });

  it('총 건수를 헤더에 표시한다', async () => {
    mockFetchLoginHistory.mockResolvedValue(page([record], { total: 42 }));

    renderWithQuery(<LoginHistoryManagement />);

    expect(await screen.findByText('총 42건')).toBeInTheDocument();
  });

  it('첫 조회는 page·limit 만 보내고 빈 필터는 제외한다', async () => {
    mockFetchLoginHistory.mockResolvedValue(page([record]));

    renderWithQuery(<LoginHistoryManagement />);

    await waitFor(() => expect(mockFetchLoginHistory).toHaveBeenCalled());
    expect(mockFetchLoginHistory.mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
  });

  it('상태 필터를 고르면 쿼리 파라미터에 실린다', async () => {
    mockFetchLoginHistory.mockResolvedValue(page([record]));
    renderWithQuery(<LoginHistoryManagement />);

    // 첫 조회가 끝나 필터 UI 가 나타날 때까지 기다린 뒤 조작한다
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'failed' } });

    await waitFor(() => {
      const lastParams = mockFetchLoginHistory.mock.calls.at(-1)?.[0];
      expect(lastParams).toMatchObject({ status: 'failed', page: 1 });
    });
  });

  it('기록이 없으면 빈 안내를 보여준다', async () => {
    mockFetchLoginHistory.mockResolvedValue(page([]));

    renderWithQuery(<LoginHistoryManagement />);

    expect(await screen.findByText('로그인 이력이 없습니다.')).toBeInTheDocument();
  });

  // 로그 화면에서 '못 불러옴' 과 '기록 없음' 이 같아 보이면 안 된다. 관리자가 무슨 일이
  // 있었는지 확인하러 오는 곳이라, 실패를 깨끗함으로 읽으면 판단이 정면으로 뒤집힌다.
  // (VirtualLogTable 을 공유하는 감사·보안 로그 탭도 같은 경로를 탄다)
  it('조회가 실패하면 빈 안내가 아니라 실패를 알린다', async () => {
    mockFetchLoginHistory.mockRejectedValue(new Error('network down'));

    renderWithQuery(<LoginHistoryManagement />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByText('로그인 이력이 없습니다.')).not.toBeInTheDocument();
  });

  it('첫 페이지에서는 이전 버튼이, 마지막 페이지에서는 다음 버튼이 비활성', async () => {
    mockFetchLoginHistory.mockResolvedValue(page([record], { totalPages: 1 }));

    renderWithQuery(<LoginHistoryManagement />);

    await screen.findByText('관리자');
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });
});
