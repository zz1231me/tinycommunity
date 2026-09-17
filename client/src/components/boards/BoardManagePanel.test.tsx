// client/src/components/boards/BoardManagePanel.test.tsx
// 게시판 관리 패널의 담당자 구역 — 누구에게 보이고, 무엇을 부르는가.
//
// 이 패널은 관리자만 여는 곳이 아니다. canManage 는 전역 admin·manager 와
// '그 게시판 담당자' 모두에게 참이다. 반면 서버는 담당자 추가·삭제를 admin 전용으로
// 막아 두었고, 목록 조회조차 admin·manager 만 허용한다.
//
// 그래서 이 구역은 화면에서도 admin 에게만 보여야 한다. 어긋나면 두 방향으로 해롭다 —
// 담당자에게 보이면 눌러도 403 인 버튼이 생기고, 그걸 맞추겠다고 서버를 열면
// 담당자가 스스로 담당자를 늘릴 수 있게 된다.
//
// 보이는지만 보지 않고 '부르지 않는지' 까지 고정한다. 구역을 감추면서 데이터는
// 그대로 받아오면 권한 없는 호출이 조용히 남는다.

import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BoardManagePanel } from './BoardManagePanel';
import { useAuth } from '../../store/auth';
import { makeUser } from '../../test/factories';
import type { BoardManagerRecord } from '../../types/boardManager.types';

const mockGetTags = vi.fn();
const mockGetBoardManagers = vi.fn();
const mockAddBoardManager = vi.fn();
const mockRemoveBoardManager = vi.fn();
const mockFetchAdminUsers = vi.fn();

// 이 패널은 motion.div 로 열리며 진입 애니메이션을 돈다. happy-dom 에서는 그 애니메이션이
// 언마운트로 취소될 때 잡히지 않는 AbortError 를 남기고, 테스트가 전부 통과해도 vitest 가
// 실행을 실패로 끝낸다(exit 1). LotteryPanel 테스트와 같은 방식으로 걷어 낸다.
//
// AnimatePresence 도 함께 돌려줘야 한다 — 패널이 그리는 ConfirmationModal 이 그것을
// 가져오므로, motion 만 내보내면 모듈 전체가 대체되면서 모달 쪽이 깨진다.
//
// 태그별 컴포넌트는 한 번 만들어 재사용한다. 접근할 때마다 새로 만들면 React 가 매 렌더마다
// 그 자리를 갈아 끼워, 방금 찾은 노드가 문서에서 떨어진다.
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      whileHover: _wh,
      whileTap: _wt,
      layout: _l,
      ...rest
    }: Record<string, unknown>) {
      return createElement(tag, rest);
    };
  const cache = new Map<string, ReturnType<typeof strip>>();
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) => {
          if (!cache.has(tag)) cache.set(tag, strip(tag));
          return cache.get(tag);
        },
      }
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
  };
});

vi.mock('../../api/tags', () => ({
  getTags: () => mockGetTags(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock('../../api/boards', () => ({
  updateBoardInfo: vi.fn(),
}));

vi.mock('../../api/admin', () => ({
  fetchAdminUsers: () => mockFetchAdminUsers(),
}));

vi.mock('../../api/boardManagers', () => ({
  getBoardManagers: (boardId: string) => mockGetBoardManagers(boardId),
  addBoardManager: (boardId: string, userId: string) => mockAddBoardManager(boardId, userId),
  removeBoardManager: (id: string) => mockRemoveBoardManager(id),
}));

vi.mock('../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const manager = (over: Partial<BoardManagerRecord> = {}): BoardManagerRecord => ({
  id: 'bm-1',
  boardId: 'notice',
  userId: 'alice',
  createdAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'alice', name: '앨리스', email: 'a@b.c', avatar: null },
  ...over,
});

const adminUser = () =>
  makeUser({
    id: 'admin',
    name: '관리자',
    role: 'admin',
    roleInfo: { id: 'admin', name: '관리자', description: '', isActive: true },
  });

function show() {
  return render(
    <BoardManagePanel
      boardType="notice"
      initialName="공지사항"
      initialDescription=""
      initialTaskEnabled={false}
      onClose={vi.fn()}
      onBoardUpdated={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTags.mockResolvedValue([]);
  mockGetBoardManagers.mockResolvedValue([manager()]);
  mockFetchAdminUsers.mockResolvedValue([
    { id: 'alice', name: '앨리스', roleId: 'user', isActive: true, createdAt: '', updatedAt: '' },
    { id: 'bobby', name: '바비', roleId: 'user', isActive: true, createdAt: '', updatedAt: '' },
  ]);
  useAuth.setState({ user: null, isAuthenticated: false, isLoading: false, tokenInfo: null });
});

describe('누구에게 보이는가', () => {
  it('관리자가 아니면 담당자 구역이 없다', async () => {
    useAuth.getState().setUser(makeUser()); // role: 'user'

    show();

    await screen.findByText('기본 정보');
    expect(screen.queryByText('게시판 담당자')).not.toBeInTheDocument();
  });

  it('관리자가 아니면 관리자 전용 API 를 부르지도 않는다', async () => {
    useAuth.getState().setUser(makeUser());

    show();

    await screen.findByText('기본 정보');
    expect(mockGetBoardManagers).not.toHaveBeenCalled();
    expect(mockFetchAdminUsers).not.toHaveBeenCalled();
  });

  it('역할이 admin 이어도 비활성 역할이면 보이지 않는다', async () => {
    // store 의 isAdmin() 은 roleInfo.isActive 까지 본다
    useAuth.getState().setUser(
      makeUser({
        role: 'admin',
        roleInfo: { id: 'admin', name: '관리자', description: '', isActive: false },
      })
    );

    show();

    await screen.findByText('기본 정보');
    expect(screen.queryByText('게시판 담당자')).not.toBeInTheDocument();
    expect(mockGetBoardManagers).not.toHaveBeenCalled();
  });

  it('관리자에게는 구역과 현재 담당자가 보인다', async () => {
    useAuth.getState().setUser(adminUser());

    show();

    expect(await screen.findByText('게시판 담당자')).toBeInTheDocument();
    expect(await screen.findByText('앨리스')).toBeInTheDocument();
    expect(mockGetBoardManagers).toHaveBeenCalledWith('notice');
  });
});

describe('담당자 추가', () => {
  beforeEach(() => {
    useAuth.getState().setUser(adminUser());
  });

  it('검색해서 누르면 이 게시판의 담당자로 지정된다', async () => {
    mockAddBoardManager.mockResolvedValue(manager({ id: 'bm-2', userId: 'bobby' }));
    show();
    await screen.findByText('게시판 담당자');

    fireEvent.change(screen.getByPlaceholderText('이름 또는 아이디로 사용자 검색'), {
      target: { value: '바비' },
    });

    fireEvent.click(await screen.findByRole('button', { name: /바비/ }));

    await waitFor(() => expect(mockAddBoardManager).toHaveBeenCalledWith('notice', 'bobby'));
  });

  it('이미 담당자인 사람은 후보로 나오지 않는다', async () => {
    show();
    await screen.findByText('게시판 담당자');

    const input = screen.getByPlaceholderText('이름 또는 아이디로 사용자 검색');

    // 먼저 후보가 실제로 도착한 것을 확인한다. 이 단계 없이 곧바로 '앨리스' 를 치면
    // 아직 목록이 오기 전이라 후보가 비어 있고, 그때도 같은 문구가 뜬다 —
    // 걸러내기가 망가져도 통과하는 테스트가 된다.
    fireEvent.change(input, { target: { value: '바' } });
    await screen.findByRole('button', { name: /바비/ });

    fireEvent.change(input, { target: { value: '앨리스' } });

    expect(await screen.findByText('추가할 수 있는 사용자가 없습니다.')).toBeInTheDocument();
    // '담당자로 지정' 은 후보 행에만 있는 문구다. 담당자 목록의 '제외' 버튼과 헷갈리지 않는다.
    expect(screen.queryByText('담당자로 지정')).not.toBeInTheDocument();
  });

  it('검색어를 넣기 전에는 후보를 펼치지 않는다', async () => {
    show();
    await screen.findByText('게시판 담당자');

    expect(screen.queryByText('담당자로 지정')).not.toBeInTheDocument();
  });

  it('검색을 시작하기 전에는 사용자 목록을 받아 오지 않는다', async () => {
    // 패널을 열 때마다 전체 사용자를 끌어오면, 담당자를 건드릴 생각이 없는 사람도
    // 그 비용을 치른다. 후보는 검색할 때만 필요하다.
    show();
    await screen.findByText('게시판 담당자');
    expect(mockFetchAdminUsers).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('이름 또는 아이디로 사용자 검색'), {
      target: { value: '바' },
    });

    await waitFor(() => expect(mockFetchAdminUsers).toHaveBeenCalledTimes(1));
  });

  it('글자를 더 쳐도 사용자 목록을 다시 받지 않는다', async () => {
    show();
    await screen.findByText('게시판 담당자');

    const input = screen.getByPlaceholderText('이름 또는 아이디로 사용자 검색');
    fireEvent.change(input, { target: { value: '바' } });
    await waitFor(() => expect(mockFetchAdminUsers).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: '바비' } });
    await screen.findByRole('button', { name: /바비/ });

    expect(mockFetchAdminUsers).toHaveBeenCalledTimes(1);
  });
});

describe('담당자 제외', () => {
  beforeEach(() => {
    useAuth.getState().setUser(adminUser());
  });

  it('확인을 거친 뒤에만 제외한다', async () => {
    mockRemoveBoardManager.mockResolvedValue(undefined);
    show();
    await screen.findByText('게시판 담당자');

    fireEvent.click(await screen.findByRole('button', { name: '앨리스님을 담당자에서 제외' }));

    // 확인 전에는 아직 부르지 않는다
    expect(mockRemoveBoardManager).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: '제외' }));

    await waitFor(() => expect(mockRemoveBoardManager).toHaveBeenCalledWith('bm-1'));
  });
});

// 이 패널은 포커스 처리를 손으로 갖고 있었다 — 첫 포커스를 닫기 단추로, ESC 로 닫기.
// 그것을 공용 훅(useFocusTrap)으로 옮기면서 없던 Tab 가두기가 함께 붙었다.
// 옮긴 쪽이 '같은 자리에서 시작한다' 는 것을 고정한다.
describe('포커스', () => {
  // 담당자 구역은 관리자에게만 보인다. 여기서 볼 것은 포커스뿐이라 일반 사용자로 두고
  // 화면을 단순하게 유지한다.
  beforeEach(() => {
    useAuth.getState().setUser(makeUser());
  });

  const closeBtn = () => screen.getByRole('button', { name: '닫기' });

  /** show() 와 같되 onClose 를 넘겨받는다 — ESC 가 그것을 부르는지 보려면 필요하다 */
  const showWithClose = (onClose: () => void) =>
    render(
      <BoardManagePanel
        boardType="notice"
        initialName="공지사항"
        initialDescription=""
        initialTaskEnabled={false}
        onClose={onClose}
        onBoardUpdated={vi.fn()}
      />
    );

  it('열면 닫기 단추에서 시작한다 — 손으로 하던 것과 같은 자리', async () => {
    show();
    await waitFor(() => expect(document.activeElement).toBe(closeBtn()));
  });

  it('처음에서 Shift+Tab 해도 패널 안에 머문다', async () => {
    show();
    await waitFor(() => expect(document.activeElement).toBe(closeBtn()));

    // 마지막 요소가 무엇인지는 화면 구성에 따라 달라지므로 못 박지 않는다.
    // 가두지 않으면 훅이 아무것도 하지 않아 닫기 단추에 그대로 남는다 — 그것을 가려낸다.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).not.toBe(closeBtn());
    const panel = screen.getByRole('dialog', { name: '게시판 관리' });
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('ESC 를 누르면 닫는다', async () => {
    const onClose = vi.fn();
    showWithClose(onClose);
    await waitFor(() => expect(document.activeElement).toBe(closeBtn()));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
