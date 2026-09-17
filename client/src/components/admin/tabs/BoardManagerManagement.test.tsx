// client/src/components/admin/tabs/BoardManagerManagement.test.tsx
//
// 게시판 목록 조회가 실패하면 왼쪽 칸이 아무 문구도 없이 비어 있었다.
// 관리자는 그걸 '게시판이 하나도 없다' 로 읽는다 — 실패와 '정말 없음' 은 다른 상태다.
// ErrorLogManagement 테스트와 같은 이유로 이 화면도 따로 확인한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import BoardManagerManagement from './BoardManagerManagement';

const mockGetBoards = vi.fn();
// vi.mock 은 모듈을 통째로 바꾼다 — 이 화면이 쓰는 셋을 모두 넣어야 한다.
vi.mock('../../../api/boardManagers', () => ({
  getAllBoardsWithManagers: () => mockGetBoards(),
  addBoardManager: vi.fn(),
  removeBoardManager: vi.fn(),
}));

const mockFetchAdminUsers = vi.fn();
vi.mock('../../../api/admin', () => ({
  fetchAdminUsers: () => mockFetchAdminUsers(),
}));

vi.mock('../../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const board = (id: string, name: string) => ({
  id,
  name,
  description: '',
  boardManagers: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAdminUsers.mockResolvedValue([]);
});

describe('게시판 담당자 — 목록을 못 불러왔을 때', () => {
  it('실패를 실패라고 말한다', async () => {
    mockGetBoards.mockRejectedValue(new Error('네트워크 끊김'));
    renderWithQuery(<BoardManagerManagement />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
  });

  it('정말 없을 때는 없다고 한다 — 실패와 구분된다', async () => {
    mockGetBoards.mockResolvedValue([]);
    renderWithQuery(<BoardManagerManagement />);

    expect(await screen.findByText('게시판이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
  });

  it('불러오면 게시판이 보인다 — 양성 대조', async () => {
    // 이것이 없으면 '언제나 실패 문구' 인 구현도 위 테스트를 통과한다
    mockGetBoards.mockResolvedValue([board('notice', '공지사항'), board('free', '자유게시판')]);
    renderWithQuery(<BoardManagerManagement />);

    expect(await screen.findByText('공지사항')).toBeInTheDocument();
    expect(screen.getByText('자유게시판')).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText('게시판이 없습니다.')).not.toBeInTheDocument();
  });
});
