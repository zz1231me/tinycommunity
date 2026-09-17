// client/src/components/admin/tabs/TagManagement.test.tsx
//
// 태그 조회가 실패해도 "이 게시판에 등록된 태그가 없습니다" 가 떴다.
// 관리자는 그걸 보고 이미 있는 태그를 다시 만든다 — 실패와 '정말 없음' 은 다른 상태다.
//
// 태그는 게시판을 고른 뒤에야 조회되므로(enabled), 먼저 게시판을 눌러야 한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithQuery } from '../../../test/renderWithQuery';
import TagManagement from './TagManagement';

const mockGetTags = vi.fn();
// vi.mock 은 모듈을 통째로 바꾼다 — 이 화면이 쓰는 넷을 모두 넣어야 한다.
vi.mock('../../../api/tags', () => ({
  getTags: (boardId: unknown) => mockGetTags(boardId),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

const mockGetBoards = vi.fn();
vi.mock('../../../api/boardManagers', () => ({
  getAllBoardsWithManagers: () => mockGetBoards(),
}));

vi.mock('../../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const BOARD = { id: 'notice', name: '공지사항', description: '', boardManagers: [] };

/** 게시판을 골라야 태그 조회가 시작된다 */
async function pickBoard() {
  fireEvent.click(await screen.findByRole('button', { name: '공지사항' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBoards.mockResolvedValue([BOARD]);
});

describe('태그 목록을 못 불러왔을 때', () => {
  it('실패를 실패라고 말한다', async () => {
    mockGetTags.mockRejectedValue(new Error('네트워크 끊김'));
    renderWithQuery(<TagManagement />);
    await pickBoard();

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
  });

  it('정말 없을 때는 없다고 한다 — 실패와 구분된다', async () => {
    mockGetTags.mockResolvedValue([]);
    renderWithQuery(<TagManagement />);
    await pickBoard();

    expect(await screen.findByText(/등록된 태그가 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
  });

  it('불러오면 태그가 보인다 — 양성 대조', async () => {
    // 이것이 없으면 '언제나 실패 문구' 인 구현도 위 테스트를 통과한다
    mockGetTags.mockResolvedValue([
      { id: 1, name: '공지', color: '#64748b' },
      { id: 2, name: '긴급', color: '#b56576' },
    ]);
    renderWithQuery(<TagManagement />);
    await pickBoard();

    // 칩은 이름 앞에 # 를 붙여 그린다 (#공지)
    expect(await screen.findByText('#공지')).toBeInTheDocument();
    expect(screen.getByText('#긴급')).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/등록된 태그가 없습니다/)).not.toBeInTheDocument();
  });
});
