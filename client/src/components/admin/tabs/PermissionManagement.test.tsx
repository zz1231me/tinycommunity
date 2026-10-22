// 게시판별 권한 화면.
//
// 게시판마다 역할 여섯 줄짜리 표를 다 펴 두면 아홉 게시판에 4,958px 이 됐다. 게시판이
// 스무 개면 만 픽셀을 넘는다. 접어 두고 요약만 보여 준다.
//
// 지켜야 하는 선:
//  1. 접은 채로도 이 게시판이 얼마나 열려 있는지 보여야 한다. 안 그러면 전부 펴 보게 된다.
//  2. 저장 안 된 게시판은 접히지 않는다 — 고친 것을 숨기면 그대로 떠난다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// 보기 셋. 묻는 것이 달라서 한 화면으로는 둘 다 답하지 못한다.
//
// 게시판별 카드는 "이 게시판은 누구에게 열려 있나" 만 답한다. 그 반대("이 역할은 어느
// 게시판을 쓸 수 있나")를 보려면 게시판을 전부 펼쳐 눈으로 모아야 했다.
//
// 예전에는 '관계도 보기' 를 눌러도 카드가 그대로 남고 관계도가 아래에 덧붙었는데
// (실측 1,659 → 2,175px) 단추 이름만 '테이블 보기' 로 바뀌었다 — 보고 있지도 않은
// 곳으로 돌아가라는 말이었다.
describe('권한 보기 바꾸기', () => {
  const views = () => screen.getByRole('group', { name: '권한 보기' });
  const go = (name: string) =>
    fireEvent.click(within(views()).getByRole('button', { name: new RegExp(name) }));

  it('한눈에 보기는 게시판 × 역할 표를 그린다', async () => {
    await show();
    go('한눈에');

    const cols = screen.getAllByRole('columnheader').map(c => c.textContent);
    expect(cols[0]).toBe('게시판');
    expect(cols.some(c => c?.startsWith('관리자'))).toBe(true);
    expect(cols.some(c => c?.startsWith('일반 사용자'))).toBe(true);
    // 가로줄은 게시판
    expect(screen.getByRole('rowheader', { name: /공지사항/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /자유게시판/ })).toBeInTheDocument();
  });

  // 이것이 이 보기를 만든 이유다 — 세로줄 합계가 "이 역할이 어디에 열려 있나" 를 답한다.
  it('역할마다 몇 개 게시판에 열려 있는지 머리줄에 센다', async () => {
    await show();
    go('한눈에');
    // 쓰기: 관리자는 2곳 모두, 일반 사용자는 자유게시판만
    fireEvent.click(within(screen.getByRole('group', { name: '볼 권한' })).getByText('쓰기'));

    const cols = screen.getAllByRole('columnheader').map(c => c.textContent);
    expect(cols.find(c => c?.startsWith('관리자'))).toContain('2/2');
    expect(cols.find(c => c?.startsWith('일반 사용자'))).toContain('1/2');
  });

  it('권한을 바꾸면 그 권한의 칸만 보여 준다', async () => {
    await show();
    go('한눈에');
    expect(
      screen.getByRole('switch', { name: '공지사항 일반 사용자 읽기 권한' })
    ).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('group', { name: '볼 권한' })).getByText('삭제'));
    expect(screen.queryByRole('switch', { name: /읽기 권한/ })).toBeNull();
    expect(
      screen.getByRole('switch', { name: '공지사항 일반 사용자 삭제 권한' })
    ).toBeInTheDocument();
  });

  it('표에서 켜면 같은 곳으로 간다 — 게시판별 카드와 한 상태다', async () => {
    await show();
    go('한눈에');
    fireEvent.click(within(screen.getByRole('group', { name: '볼 권한' })).getByText('쓰기'));
    fireEvent.click(screen.getByRole('switch', { name: '공지사항 일반 사용자 쓰기 권한' }));
    // 네 번째 인자로 현재 권한 목록도 함께 간다. 여기서 보려는 것은 '어느 칸을 눌렀나' 다.
    expect(hook.updatePermission.mock.calls[0].slice(0, 3)).toEqual(['notice', 'user', 'canWrite']);
  });

  // 덧붙이지 않고 바꿔 끼운다.
  it('관계도를 고르면 게시판 카드는 사라진다', async () => {
    await show();
    expect(screen.getByText('읽기 2 · 쓰기 1 · 삭제 1')).toBeInTheDocument();

    go('관계도');
    expect(screen.queryByText('읽기 2 · 쓰기 1 · 삭제 1')).toBeNull();
  });

  it('한눈에 보기도 게시판 찾기를 따른다', async () => {
    await show();
    go('한눈에');
    fireEvent.change(screen.getByRole('searchbox', { name: /게시판 이름/ }), {
      target: { value: '자유' },
    });
    expect(screen.getByRole('rowheader', { name: /자유게시판/ })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: /공지사항/ })).toBeNull();
  });

  // 찾기로 줄을 줄여도 역할이 닿는 범위가 변하는 것은 아니다. 걸러진 것만 세면
  // '자유' 로 찾았을 때 1/1 로 보여 실제(2개 중 1개)를 숨긴다.
  it('찾는 중에도 세로줄 합계는 전체 게시판으로 센다', async () => {
    await show();
    go('한눈에');
    fireEvent.click(within(screen.getByRole('group', { name: '볼 권한' })).getByText('쓰기'));
    fireEvent.change(screen.getByRole('searchbox', { name: /게시판 이름/ }), {
      target: { value: '자유' },
    });

    const cols = screen.getAllByRole('columnheader').map(c => c.textContent);
    // 한 줄만 보이지만 일반 사용자는 두 게시판 중 한 곳에서 쓸 수 있다
    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
    expect(cols.find(c => c?.startsWith('일반 사용자'))).toContain('1/2');
  });
});
