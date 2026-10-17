// 프로필 메뉴의 포인트 줄.
//
// 포인트 화면은 프로필 안쪽 탭이라 들어가려면 '프로필 설정 → 포인트 탭' 두 걸음이었다.
// 메뉴에서 바로 가게 하고, 잔액도 함께 보여 준다.
//
// 지켜야 할 선: ① 열기 전에는 잔액을 묻지 않는다(쓰지도 않을 요청을 늘리지 않게)
// ② 포인트 기능이 꺼져 있거나 메뉴를 숨겼으면 줄도 없다 ③ 누르면 포인트 탭으로 간다.

import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { UserDropdown } from './UserDropdown';
import { renderWithQuery } from '../../test/renderWithQuery';
import { useAuth } from '../../store/auth';
import { useFeatures } from '../../store/features';
import { ThemeProvider } from '../../contexts/ThemeContext';

// framer-motion 의 애니메이션은 happy-dom 에서 취소될 때 잡히지 않는 AbortError 를 남기고,
// vitest 는 테스트가 모두 통과해도 그 때문에 실패로 끝난다(NotificationBell.test 와 같은 처리).
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      variants: _v,
      style: _s,
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

const navigate = vi.fn();
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const api = vi.hoisted(() => ({ fetchPointStatus: vi.fn() }));
vi.mock('../../api/points', () => api);

vi.mock('../../hooks/useAccessibleBoards', () => ({
  useAccessibleBoards: () => ({ personalBoards: [] }),
}));

// 메뉴 안에 테마 전환이 들어 있어 ThemeProvider 가 필요하다
const show = () =>
  renderWithQuery(
    <ThemeProvider>
      <UserDropdown />
    </ThemeProvider>
  );

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: '사용자 메뉴' }));

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchPointStatus.mockResolvedValue({ balance: 1234 });
  useAuth.setState({
    user: { id: 'u1', name: '점검용a', role: 'user' } as never,
    isAuthenticated: true,
  });
  useFeatures.setState({ features: { 'tools.lottery': true } as never, hidden: [] });
});

describe('프로필 메뉴의 포인트', () => {
  it('열기 전에는 잔액을 묻지 않는다', () => {
    show();
    expect(api.fetchPointStatus).not.toHaveBeenCalled();
  });

  it('열면 잔액과 함께 보여 주고, 누르면 포인트 탭으로 간다', async () => {
    show();
    openMenu();

    const row = await screen.findByRole('button', { name: /포인트/ });
    await waitFor(() => expect(screen.getByText('1,234P')).toBeInTheDocument());

    fireEvent.click(row);
    expect(navigate).toHaveBeenCalledWith('/profile?tab=points');
  });

  it('포인트 기능이 꺼져 있으면 줄도 없다', () => {
    useFeatures.setState({ features: { 'tools.lottery': false } as never, hidden: [] });
    show();
    openMenu();

    expect(screen.queryByRole('button', { name: /포인트/ })).not.toBeInTheDocument();
    expect(api.fetchPointStatus).not.toHaveBeenCalled();
  });

  it('메뉴를 숨겨 두었으면 줄도 없다 — 보기 설정도 따른다', () => {
    useFeatures.setState({
      features: { 'tools.lottery': true } as never,
      hidden: ['tools.lottery'] as never,
    });
    show();
    openMenu();

    expect(screen.queryByRole('button', { name: /포인트/ })).not.toBeInTheDocument();
  });
});
