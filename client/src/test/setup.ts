// Vitest 테스트 설정.
// jest-dom 7 부터는 러너별 진입점을 써야 matcher 타입이 붙는다. 예전 경로는 tsc 만 깨진다.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

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

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

globalThis.fetch = vi.fn() as typeof fetch;

// happy-dom 은 레이아웃을 계산하지 않아 크기가 0 이라 가상 목록의 행이 하나도 안 생긴다.
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
