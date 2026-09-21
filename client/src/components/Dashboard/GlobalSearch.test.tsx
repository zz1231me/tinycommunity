// client/src/components/Dashboard/GlobalSearch.test.tsx
// ⌘K 는 화면 전체에서 듣는 단축키다. 무엇이 앞에 있든 열리면 세 가지가 어긋난다:
//  · 글을 쓰는 중이면 편집기의 Ctrl+K(링크 넣기)를 빼앗는다
//  · 대화상자가 떠 있으면 그 아래로 열려, 보이지 않는 칸으로 포커스만 끌려간다
//  · 기능이 꺼져 있으면 아무것도 그리지 않으면서 배경 스크롤만 잠근다

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';

const featureOn = vi.hoisted(() => ({ value: true }));
vi.mock('../../store/features', () => ({ useFeature: () => featureOn.value }));
vi.mock('../../api/axios', () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock('../../store/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 'u1', role: 'user' } }),
}));
vi.mock('../../hooks/useSearchHistory', () => ({
  useSearchHistory: () => ({
    history: [],
    addHistory: vi.fn(),
    removeHistory: vi.fn(),
    clearHistory: vi.fn(),
    viewedResults: [],
    addViewedResult: vi.fn(),
    removeViewed: vi.fn(),
    clearViewed: vi.fn(),
  }),
}));

import { GlobalSearch } from './GlobalSearch';
import { useUIOverlays } from '../../store/uiOverlays';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { resetScrollLock } from '../../utils/scrollLock';

const cmdK = (target: Element | Document = document) =>
  fireEvent.keyDown(target, { key: 'k', metaKey: true });

const isOpen = () => useUIOverlays.getState().activeDropdown === 'search';

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  return (
    <div ref={ref}>
      <button type="button">대화상자 단추</button>
    </div>
  );
}

const renderSearch = (extra?: React.ReactNode) =>
  render(
    <MemoryRouter>
      <GlobalSearch />
      {extra}
    </MemoryRouter>
  );

describe('전역 검색 단축키', () => {
  beforeEach(() => {
    resetScrollLock();
    featureOn.value = true;
    useUIOverlays.getState().closeAll();
  });

  it('평소에는 ⌘K 로 열린다 — 대조군', () => {
    renderSearch();
    cmdK();
    expect(isOpen()).toBe(true);
  });

  it('글을 쓰는 중에는 편집기에 양보한다', () => {
    renderSearch(<div contentEditable data-testid="editor" />);
    cmdK(screen.getByTestId('editor'));
    // 편집기에서 Ctrl+K 는 링크 넣기다 — 검색이 열리면 링크 상자에서 포커스를 빼앗는다
    expect(isOpen()).toBe(false);
  });

  it('대화상자가 떠 있으면 그 아래로 열리지 않는다', () => {
    renderSearch(<Dialog onClose={vi.fn()} />);
    cmdK();
    expect(isOpen()).toBe(false);
  });

  it('기능이 꺼져 있으면 열리지도, 배경을 잠그지도 않는다', () => {
    featureOn.value = false;
    renderSearch();
    cmdK();
    expect(isOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
});
