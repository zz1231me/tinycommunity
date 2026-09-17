// client/src/components/BoardProtectedRoute.test.tsx
// 게시판 접근 가드는 사이드바 캐시(1단계) → 서버 확인(2단계) 순으로 판정한다.
// 두 경로 모두와, 서버가 403 을 주는 실패 경로까지 검증한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter } from 'react-router-dom';
import BoardProtectedRoute from './BoardProtectedRoute';
import { useAuth } from '../store/auth';
import { makeUser } from '../test/factories';

const mockUseAccessibleBoards = vi.fn();
const mockCheckUserBoardAccess = vi.fn();

vi.mock('../hooks/useAccessibleBoards', () => ({
  useAccessibleBoards: () => mockUseAccessibleBoards(),
}));

vi.mock('../api/boards', () => ({
  checkUserBoardAccess: (boardType: string) => mockCheckUserBoardAccess(boardType),
}));

function board(id: string, perms: { canRead: boolean; canWrite: boolean; canDelete: boolean }) {
  return { id, name: id, permissions: perms };
}

function renderGuard(boardType: string, action?: 'read' | 'write' | 'delete') {
  return render(
    <MemoryRouter initialEntries={[`/boards/${boardType}`]}>
      <Routes>
        <Route path="/" element={<div>로그인 화면</div>} />
        <Route
          path="/boards/:boardType"
          element={
            <BoardProtectedRoute action={action}>
              <div>게시판 내용</div>
            </BoardProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAccessibleBoards.mockReturnValue({ boards: [], loading: false });
  useAuth.setState({ user: null, isAuthenticated: false, isLoading: false, tokenInfo: null });
});

describe('BoardProtectedRoute — 사이드바 캐시 경로', () => {
  beforeEach(() => {
    useAuth.getState().setUser(makeUser());
  });

  it('캐시에 있고 권한이 있으면 서버를 호출하지 않고 통과', async () => {
    mockUseAccessibleBoards.mockReturnValue({
      boards: [board('notice', { canRead: true, canWrite: false, canDelete: false })],
      loading: false,
    });

    renderGuard('notice');

    expect(await screen.findByText('게시판 내용')).toBeInTheDocument();
    expect(mockCheckUserBoardAccess).not.toHaveBeenCalled();
  });

  it('캐시에 있지만 해당 액션 권한이 없으면 거부 화면', async () => {
    mockUseAccessibleBoards.mockReturnValue({
      boards: [board('notice', { canRead: true, canWrite: false, canDelete: false })],
      loading: false,
    });

    renderGuard('notice', 'write');

    expect(await screen.findByText('접근 권한이 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('게시판 내용')).not.toBeInTheDocument();
  });
});

describe('BoardProtectedRoute — 서버 확인 경로', () => {
  beforeEach(() => {
    useAuth.getState().setUser(makeUser());
  });

  it('캐시에 없으면 서버에 물어보고 허용되면 통과', async () => {
    mockCheckUserBoardAccess.mockResolvedValue({
      data: {
        data: { hasAccess: true, permissions: { canRead: true, canWrite: true, canDelete: false } },
      },
    });

    renderGuard('hidden-board');

    expect(await screen.findByText('게시판 내용')).toBeInTheDocument();
    expect(mockCheckUserBoardAccess).toHaveBeenCalledWith('hidden-board');
  });

  it('서버가 hasAccess:false 를 주면 거부', async () => {
    mockCheckUserBoardAccess.mockResolvedValue({
      data: { data: { hasAccess: false, permissions: null } },
    });

    renderGuard('hidden-board');

    expect(await screen.findByText('접근 권한이 없습니다')).toBeInTheDocument();
  });

  it('서버가 403 을 주면 권한 없음 메시지로 거부', async () => {
    mockCheckUserBoardAccess.mockRejectedValue({ response: { status: 403 } });

    renderGuard('hidden-board');

    expect(await screen.findByText('이 게시판에 접근할 권한이 없습니다.')).toBeInTheDocument();
  });

  it('예상치 못한 오류는 일반 오류 메시지로 거부(열어주지 않음)', async () => {
    mockCheckUserBoardAccess.mockRejectedValue({ response: { status: 500 } });

    renderGuard('hidden-board');

    expect(await screen.findByText('권한 확인 중 오류가 발생했습니다.')).toBeInTheDocument();
    expect(screen.queryByText('게시판 내용')).not.toBeInTheDocument();
  });
});

describe('BoardProtectedRoute — 인증·로딩', () => {
  it('미인증이면 로그인 화면으로', async () => {
    renderGuard('notice');
    await waitFor(() => expect(screen.getByText('로그인 화면')).toBeInTheDocument());
  });

  it('게시판 목록 로딩 중에는 로딩 화면', () => {
    useAuth.getState().setUser(makeUser());
    mockUseAccessibleBoards.mockReturnValue({ boards: [], loading: true });

    renderGuard('notice');

    expect(screen.getByText('게시판 정보 로딩 중...')).toBeInTheDocument();
  });
});

describe('BoardProtectedRoute — 게시판을 빠르게 옮길 때', () => {
  beforeEach(() => {
    useAuth.getState().setUser(makeUser());
    mockUseAccessibleBoards.mockReturnValue({ boards: [], loading: false });
  });

  function perms(v: boolean) {
    return { canRead: v, canWrite: v, canDelete: v };
  }

  // 가드는 boardType 이 바뀌면 다시 판정한다. 앞 게시판의 응답이 늦게 도착하면
  // 그 결과가 지금 보고 있는 게시판의 판정을 덮어써서, 볼 수 있는 게시판이 막히거나
  // (반대 순서로는) 서버가 거절한 게시판이 열린 것처럼 보였다.
  it('앞 게시판의 늦은 응답이 지금 게시판의 판정을 덮지 않는다', async () => {
    const resolvers: Record<string, (v: unknown) => void> = {};
    mockCheckUserBoardAccess.mockImplementation(
      (id: string) =>
        new Promise(resolve => {
          resolvers[id] = resolve;
        })
    );

    const router = createMemoryRouter(
      [
        {
          path: '/boards/:boardType',
          element: (
            <BoardProtectedRoute>
              <div>게시판 내용</div>
            </BoardProtectedRoute>
          ),
        },
      ],
      { initialEntries: ['/boards/slow'] }
    );

    render(<RouterProvider router={router} />);
    await waitFor(() => expect(resolvers.slow).toBeDefined());

    // 'slow' 판정이 끝나기 전에 'fast' 로 이동
    await act(async () => {
      await router.navigate('/boards/fast');
    });
    await waitFor(() => expect(resolvers.fast).toBeDefined());

    // 지금 게시판(fast)은 허용
    await act(async () => {
      resolvers.fast({ data: { data: { hasAccess: true, permissions: perms(true) } } });
    });
    await screen.findByText('게시판 내용');

    // 앞 게시판(slow)의 거절이 뒤늦게 도착한다 — 화면을 바꾸면 안 된다
    await act(async () => {
      resolvers.slow({ data: { data: { hasAccess: false, permissions: perms(false) } } });
    });
    expect(screen.getByText('게시판 내용')).toBeInTheDocument();
  });
});
