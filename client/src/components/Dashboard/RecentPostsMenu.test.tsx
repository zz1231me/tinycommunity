// client/src/components/Dashboard/RecentPostsMenu.test.tsx
// 머리글의 패널들은 한 번에 하나만 열려야 한다(통합 store 의 존재 이유).
// 이 메뉴만 혼자 useState 를 쓰고 있어, 검색을 열어도 사이드바를 열어도 그대로
// 떠 있었다 — 사이드바(z-40) 위로 이 패널(z-50)이 겹쳐 보였다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const posts = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock('../../api/posts', () => ({
  fetchRecentPosts: () => Promise.resolve(posts.value),
}));

import { RecentPostsMenu } from './RecentPostsMenu';
import { useUIOverlays } from '../../store/uiOverlays';

// store 가 아니라 실제로 패널이 떠 있는지로 본다 — store 만 보면 예전 구현(혼자
// useState)에서도 '닫혀 있다' 로 읽혀 아무것도 가려내지 못한다
const isOpen = () => screen.queryByRole('menu') !== null;

const openMenu = async () => {
  await act(async () => {
    screen.getByRole('button', { name: '최신 소식' }).click();
  });
};

describe('최신 소식 메뉴', () => {
  beforeEach(() => {
    useUIOverlays.getState().closeAll();
  });

  it('열면 다른 패널은 닫힌다', async () => {
    render(
      <MemoryRouter>
        <RecentPostsMenu />
      </MemoryRouter>
    );
    act(() => useUIOverlays.getState().openDropdown('notifications'));

    await openMenu();

    expect(isOpen()).toBe(true);
    expect(useUIOverlays.getState().activeDropdown).not.toBe('notifications');
  });

  it('다른 패널이 열리면 닫힌다', async () => {
    render(
      <MemoryRouter>
        <RecentPostsMenu />
      </MemoryRouter>
    );
    await openMenu();
    expect(isOpen()).toBe(true);

    act(() => useUIOverlays.getState().openDropdown('search'));

    expect(isOpen()).toBe(false);
  });

  it('모바일 사이드바를 열면 닫힌다', async () => {
    render(
      <MemoryRouter>
        <RecentPostsMenu />
      </MemoryRouter>
    );
    await openMenu();

    act(() => useUIOverlays.getState().openSidebar());

    // 사이드바(z-40) 위로 이 패널(z-50)이 겹쳐 뜨던 자리
    expect(isOpen()).toBe(false);
  });
});
