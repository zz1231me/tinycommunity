// client/src/components/Dashboard/DashboardSidebar.test.tsx
// 좁은 화면에서 사이드바는 서랍이다. 닫아도 사라지는 것이 아니라 화면 밖으로
// 밀려날 뿐이라, 그대로 두면 Tab 이 보이지 않는 링크 스무 개를 지나간다 —
// 화면에서는 아무 일도 일어나지 않는데 포커스만 사라진 것처럼 보인다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useAccessibleBoards', () => ({
  useAccessibleBoards: () => ({
    boards: [],
    loading: false,
    regularBoards: [],
    personalBoards: [],
  }),
}));
vi.mock('../../hooks/useBookmarks', () => ({
  useBookmarks: () => ({ bookmarks: [], loading: false, error: null, openBookmark: vi.fn() }),
}));
vi.mock('../../api/customPages', () => ({ fetchPublishedPages: () => Promise.resolve([]) }));
vi.mock('../../store/features', () => ({ useFeature: () => true }));
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
