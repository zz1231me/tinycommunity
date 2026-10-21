// client/src/components/Dashboard/DashboardSidebar.test.tsx
// 좁은 화면에서 사이드바는 서랍이다. 닫아도 사라지는 것이 아니라 화면 밖으로
// 밀려날 뿐이라, 그대로 두면 Tab 이 보이지 않는 링크 스무 개를 지나간다 —
// 화면에서는 아무 일도 일어나지 않는데 포커스만 사라진 것처럼 보인다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// 게시판 목록. 검사마다 바꾼다.
const boards = vi.hoisted(() => ({
  regular: [] as Array<{ id: string; name: string; taskEnabled?: boolean }>,
  personal: [] as Array<{ id: string; name: string }>,
}));
vi.mock('../../hooks/useAccessibleBoards', () => ({
  useAccessibleBoards: () => ({
    boards: [...boards.regular, ...boards.personal],
    loading: false,
    regularBoards: boards.regular,
    personalBoards: boards.personal,
  }),
}));
vi.mock('../../hooks/useBookmarks', () => ({
  useBookmarks: () => ({ bookmarks: [], loading: false, error: null, openBookmark: vi.fn() }),
}));
vi.mock('../../api/customPages', () => ({ fetchPublishedPages: () => Promise.resolve([]) }));
// 본인이 숨긴 메뉴. 검사마다 바꾼다.
const menu = vi.hoisted(() => ({ hidden: new Set<string>() }));
vi.mock('../../store/features', () => ({
  useFeature: () => true,
  useMenuVisible: (key: string) => !menu.hidden.has(key),
  useFeatures: (select: (s: { hidden: string[] }) => unknown) =>
    select({ hidden: [...menu.hidden] }),
}));
vi.mock('../../store/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: '홍길동', role: 'user' },
    getUserRole: () => 'user',
    isAdmin: () => false,
  }),
}));

import { DashboardSidebar } from './DashboardSidebar';

const setWidth = (w: number) => {
  window.innerWidth = w;
  window.matchMedia = ((q: string) => ({
    matches: w < 1024,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

const renderSidebar = (isOpen: boolean) =>
  render(
    <MemoryRouter>
      <DashboardSidebar isOpen={isOpen} onClose={vi.fn()} />
    </MemoryRouter>
  );

describe('좁은 화면의 서랍 사이드바', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('닫혀 있으면 Tab 으로 닿지 않는다', () => {
    setWidth(390);
    const { container } = renderSidebar(false);
    const aside = container.querySelector('aside');
    expect(aside).toHaveAttribute('inert');
  });

  it('열려 있으면 평소처럼 쓸 수 있다', () => {
    setWidth(390);
    const { container } = renderSidebar(true);
    expect(container.querySelector('aside')).not.toHaveAttribute('inert');
  });

  it('넓은 화면에서는 늘 보이는 기둥이라 끄지 않는다', () => {
    setWidth(1440);
    const { container } = renderSidebar(false);
    expect(container.querySelector('aside')).not.toHaveAttribute('inert');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

describe('본인이 숨긴 메뉴', () => {
  beforeEach(() => {
    setWidth(1440);
    menu.hidden.clear();
  });

  it('숨기지 않았으면 대시보드·일정·탐색이 보인다', () => {
    const { getByRole } = renderSidebar(true);
    expect(getByRole('link', { name: /대시보드/ })).toBeInTheDocument();
    expect(getByRole('link', { name: '일정' })).toBeInTheDocument();
    expect(getByRole('link', { name: /탐색/ })).toBeInTheDocument();
  });

  it('일정을 숨기면 일정만 빠진다 — 대시보드는 일정이 아니라 조망 화면이다', () => {
    menu.hidden.add('tools.calendar');
    const { queryByRole, getByRole } = renderSidebar(true);
    expect(queryByRole('link', { name: '일정' })).not.toBeInTheDocument();
    // 스위치가 없는 화면이라, 모든 기능을 꺼도 갈 곳이 하나는 남는다
    expect(getByRole('link', { name: /대시보드/ })).toBeInTheDocument();
  });

  it('탐색을 숨기면 탐색 메뉴가 빠진다', () => {
    menu.hidden.add('discovery.popular');
    const { queryByRole } = renderSidebar(true);
    expect(queryByRole('link', { name: /탐색/ })).not.toBeInTheDocument();
  });
});

describe('개인 공간', () => {
  beforeEach(() => {
    menu.hidden.clear();
    boards.regular = [];
    boards.personal = [];
    setWidth(1280);
  });

  it('도구 묶음에서 바로 간다 — 프로필 드롭다운에만 있으면 찾지 못한다', () => {
    boards.personal = [{ id: 'personal_abc', name: '홍길동님의 개인공간' }];
    renderSidebar(true);

    const entry = screen.getByRole('link', { name: /내 공간/ });
    expect(entry).toBeInTheDocument();
  });

  it('개인 공간이 없으면 줄을 두지 않는다', () => {
    renderSidebar(true);
    expect(screen.queryByRole('link', { name: /내 공간/ })).toBeNull();
  });
});

describe('업무 게시판 표식', () => {
  beforeEach(() => {
    menu.hidden.clear();
    boards.regular = [];
    boards.personal = [];
    setWidth(1280);
  });

  it('업무용 게시판은 낭독기에도 그렇게 읽힌다', () => {
    boards.regular = [
      { id: 'work', name: '개발 업무', taskEnabled: true },
      { id: 'notice', name: '공지사항', taskEnabled: false },
    ];
    renderSidebar(true);

    expect(screen.getByRole('link', { name: '개발 업무 업무 게시판' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '공지사항' })).toBeInTheDocument();
  });

  it('업무 메뉴를 숨긴 사람에게는 표식도 없다', () => {
    menu.hidden.add('post.tasks');
    boards.regular = [{ id: 'work', name: '개발 업무', taskEnabled: true }];
    renderSidebar(true);

    expect(screen.getByRole('link', { name: '개발 업무' })).toBeInTheDocument();
  });
});

describe('사이드바 줄은 진짜 링크다', () => {
  beforeEach(() => {
    menu.hidden.clear();
    boards.regular = [{ id: 'work', name: '개발 업무' }];
    boards.personal = [{ id: 'personal_abc', name: '홍길동님의 개인공간' }];
    setWidth(1280);
  });

  // 새 탭이 열리는지는 jsdom 으로 잴 수 없다. 우리가 쥐고 있는 것은 두 가지다 —
  // 진짜 href 가 있는가, 그리고 ⌘-클릭을 우리가 가로채지 않는가(preventDefault).
  it('주소를 가진다 — 없으면 새 탭으로 열기도 링크 복사도 되지 않는다', () => {
    renderSidebar(true);
    expect(screen.getByRole('link', { name: /개발 업무/ })).toHaveAttribute(
      'href',
      '/dashboard/posts/work'
    );
    expect(screen.getByRole('link', { name: /내 공간/ })).toHaveAttribute(
      'href',
      '/dashboard/posts/personal_abc'
    );
  });

  it('⌘-클릭은 브라우저에 넘긴다 — 가로채면 보던 화면만 갈아 끼운다', () => {
    renderSidebar(true);
    const entry = screen.getByRole('link', { name: /개발 업무/ });

    const plain = createEvent.click(entry, { button: 0 });
    fireEvent(entry, plain);
    // 평범한 클릭은 라우터가 맡는다
    expect(plain.defaultPrevented).toBe(true);

    const meta = createEvent.click(entry, { button: 0, metaKey: true });
    fireEvent(entry, meta);
    expect(meta.defaultPrevented).toBe(false);
  });

  it('좁은 화면에서 ⌘-클릭은 서랍을 닫지 않는다 — 머무는 화면이다', () => {
    setWidth(800);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <DashboardSidebar isOpen onClose={onClose} />
      </MemoryRouter>
    );
    const entry = screen.getByRole('link', { name: /개발 업무/ });

    fireEvent(entry, createEvent.click(entry, { button: 0, metaKey: true }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent(entry, createEvent.click(entry, { button: 0 }));
    expect(onClose).toHaveBeenCalled();
  });
});
