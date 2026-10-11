// 관리자 페이지의 잘못된 주소 처리.
//
// 오래된 북마크나 오타로 /admin/아무거나 를 열면 사용자 탭으로 보내 주기로 되어 있었다.
// 그런데 보내는 주소가 상대 경로라, 지금 주소(= '*' 로 잡힌 잘못된 경로까지 포함)에
// 이어 붙어 /admin/<잘못된경로>/users 가 되고 그것도 잘못된 경로라 다시 돌아오기를
// 반복했다. 실제로 재 보니 주소가 /users 를 200번 가까이 매단 1,216자까지 늘고,
// 뒤로 가기 기록이 39개 쌓인 채 탭은 아무것도 뜨지 않았다(요청도 하나도 나가지 않는다).

import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminPage from './index';

// framer-motion 은 happy-dom 에서 잡히지 않는 AbortError 를 남긴다(다른 테스트와 같은 처리)
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      variants: _v,
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

// 어느 탭이 떴는지만 보면 되므로 탭 알맹이는 흉내만 낸다(각자 서버를 부른다).
vi.mock('../../components/admin/tabs/UserManagement', () => ({
  default: () => <div>사용자 탭</div>,
}));
vi.mock('../../components/admin/tabs/SiteSettingsManagement', () => ({
  default: () => <div>사이트 설정 탭</div>,
}));

function Where() {
  const { pathname } = useLocation();
  // 상대 경로로 되돌아가면 주소가 끝없이 길어지고, 브라우저와 달리 jsdom 에는 리다이렉트
  // 상한이 없어 검사가 영원히 돈다(CI 가 멈춘다). 여기서 끊어 바로 실패하게 한다.
  if (pathname.length > 60) throw new Error(`주소가 계속 길어진다: ${pathname.slice(0, 80)}…`);
  return <div data-testid="where">{pathname}</div>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminPage />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );

const where = () => screen.getByTestId('where').textContent;

describe('관리자 페이지의 잘못된 주소', () => {
  it('사용자 탭으로 보낸다 — 주소를 덧붙이지 않는다', async () => {
    open('/admin/password-resets'); // 실제 경로는 password-reset-requests

    await waitFor(() => expect(where()).toBe('/admin/users'));
  });

  it('두 칸짜리 잘못된 주소도 마찬가지다', async () => {
    open('/admin/어디/여기');

    await waitFor(() => expect(where()).toBe('/admin/users'));
  });

  it('맞는 주소는 건드리지 않는다 — 양성 대조', async () => {
    open('/admin/site-settings');

    // 탭 내용은 lazy 라 늦게 오지만 주소는 그대로여야 한다
    await waitFor(() => expect(where()).toBe('/admin/site-settings'));
  });
});
