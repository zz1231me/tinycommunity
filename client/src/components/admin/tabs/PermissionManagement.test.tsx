// 게시판별 권한 화면.
//
// 게시판마다 역할 여섯 줄짜리 표를 다 펴 두면 아홉 게시판에 4,958px 이 됐다. 게시판이
// 스무 개면 만 픽셀을 넘는다. 접어 두고 요약만 보여 준다.
//
// 지켜야 하는 선:
//  1. 접은 채로도 이 게시판이 얼마나 열려 있는지 보여야 한다. 안 그러면 전부 펴 보게 된다.
//  2. 저장 안 된 게시판은 접히지 않는다 — 고친 것을 숨기면 그대로 떠난다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PermissionManagement } from './PermissionManagement';

const board = (id: string, name: string) => ({ id, name, description: '', order: 1 });

const hook = vi.hoisted(() => ({
  boards: [] as ReturnType<typeof board>[],
  permissions: {} as Record<string, unknown[]>,
  dirtyBoards: new Set<string>(),
  fetchBoards: vi.fn(),
  fetchBoardPermissions: vi.fn(),
  updatePermission: vi.fn(),
  saveAllPermissions: vi.fn(),
  discardChanges: vi.fn(),
  saving: false,
  loading: false,
  fetchError: null,
}));

vi.mock('../../../hooks/admin/useBoardManagement', () => ({
  useBoardManagement: () => hook,
}));
vi.mock('../../../hooks/admin/useRoleManagement', () => ({
  useRoleManagement: () => ({
    roles: [
      { id: 'admin', name: '관리자' },
      { id: 'user', name: '일반 사용자' },
    ],
    loading: false,
  }),
}));
vi.mock('../../../api/admin', () => ({
  fetchWikiPermissions: vi.fn().mockResolvedValue([]),
  updateWikiPermissions: vi.fn(),
}));
vi.mock('../../PermissionGraph', () => ({ PermissionGraph: () => null }));

const perms = (read: boolean, write: boolean) => [
  { roleId: 'admin', roleName: '관리자', canRead: true, canWrite: true, canDelete: true },
  { roleId: 'user', roleName: '일반 사용자', canRead: read, canWrite: write, canDelete: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  hook.boards = [board('notice', '공지사항'), board('free', '자유게시판')];
  hook.permissions = { notice: perms(true, false), free: perms(true, true) };
  hook.dirtyBoards = new Set();
});

const show = async () => {
  render(<PermissionManagement />);
  await screen.findByText('게시판별 권한');
};

describe('게시판별 권한 접기', () => {
  it('처음에는 접혀 있고 표를 그리지 않는다', async () => {
    await show();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('접은 채로도 몇 개 역할에 열려 있는지 보여 준다', async () => {
    await show();
    // 공지: 읽기 2(관리자+일반) 쓰기 1(관리자) 삭제 1
    expect(screen.getByText('읽기 2 · 쓰기 1 · 삭제 1')).toBeInTheDocument();
    // 자유: 읽기 2 쓰기 2 삭제 1
    expect(screen.getByText('읽기 2 · 쓰기 2 · 삭제 1')).toBeInTheDocument();
  });

  it('펼치면 그 게시판의 표만 나온다', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: /공지사항/ }));
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(1));
    expect(screen.getByRole('switch', { name: '일반 사용자 읽기 권한' })).toBeInTheDocument();
  });

  // 접어서 숨기면 저장 안 된 변경을 모른 채 떠나게 된다.
  it('저장 안 된 게시판은 접히지 않는다', async () => {
    hook.dirtyBoards = new Set(['notice']);
    await show();
    expect(screen.getAllByRole('table')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /공지사항/ }));
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByText('변경됨 (미저장)')).toBeInTheDocument();
  });

  it('이름으로 게시판을 찾는다', async () => {
    await show();
    fireEvent.change(screen.getByRole('searchbox', { name: /게시판 이름/ }), {
      target: { value: '자유' },
    });
    expect(screen.getByText('읽기 2 · 쓰기 2 · 삭제 1')).toBeInTheDocument();
    expect(screen.queryByText('읽기 2 · 쓰기 1 · 삭제 1')).toBeNull();
  });
});
