// client/src/test/setup.ts - Vitest 테스트 설정
// jest-dom 7 부터는 러너별 진입점을 써야 matcher 타입이 붙는다.
// 예전 경로('@testing-library/jest-dom')로 두면 실행은 되는데 toBeInTheDocument 가
// 타입에 없어서 tsc 만 깨진다 — 테스트는 통과하는데 빌드가 막히는 상태가 된다.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// 각 테스트 후 자동 정리
afterEach(() => {
  cleanup();
});

// 브라우저 API 모킹
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// localStorage 모킹
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// fetch 기본 모킹
globalThis.fetch = vi.fn() as typeof fetch;

// @tanstack/react-virtual 은 스크롤 컨테이너의 실제 크기를 읽어 렌더할 행을 정한다.
// happy-dom 은 레이아웃을 계산하지 않아 모든 크기가 0 → 가상 행이 하나도 생성되지 않는다.
// 가상 목록을 쓰는 컴포넌트를 테스트할 수 있도록 뷰포트 크기를 갖는 것처럼 보이게 한다.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 500,
});
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get: () => 500,
});
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => 1000,
});
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get: () => 1000,
});

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
