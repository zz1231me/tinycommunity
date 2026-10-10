// 관리자가 기능을 끈 뒤, 이미 열어 둔 화면이 안내로 바뀌는지.
//
// 이 안내 화면은 처음부터 있었지만 세션 중에는 뜨지 않았다 — 스위치 목록을 로그인할 때
// 한 번만 읽기 때문이다. 서버가 403 + FEATURE_DISABLED 로 거절하면 목록을 다시 읽어
// (api/featureSignal.ts) 여기까지 닿아야 한다.

import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeatureRoute } from './FeatureRoute';
import { applyFeatureSignal } from '../../api/featureSignal';
import { useFeatures } from '../../store/features';

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

const mockGet = vi.fn();
vi.mock('../../api/axios', () => ({ default: { get: (url: string) => mockGet(url) } }));

const show = () =>
  render(
    <MemoryRouter>
      <FeatureRoute feature="tools.memo" name="메모">
        <div>메모 화면</div>
      </FeatureRoute>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useFeatures.setState({ features: { 'tools.memo': true }, loaded: true });
});

describe('기능이 도중에 꺼질 때', () => {
  it('거절을 받으면 새로고침 없이 안내 화면으로 바뀐다', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: { 'tools.memo': false } } });
    show();
    expect(screen.getByText('메모 화면')).toBeInTheDocument();

    applyFeatureSignal({ response: { status: 403, data: { code: 'FEATURE_DISABLED' } } });

    expect(await screen.findByText('메모 기능이 꺼져 있습니다.')).toBeInTheDocument();
    expect(screen.queryByText('메모 화면')).not.toBeInTheDocument();
  });

  it('아직 켜져 있으면 그대로 둔다 — 양성 대조', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: { 'tools.memo': true } } });
    show();

    applyFeatureSignal({ response: { status: 403, data: { code: 'FEATURE_DISABLED' } } });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.getByText('메모 화면')).toBeInTheDocument();
  });
});

describe('안내를 띄우기 전에 다시 묻는다', () => {
  it('그 사이 다시 켜졌으면 안내 대신 화면을 보여 준다', async () => {
    // 목록은 로그인할 때 읽은 것이다. 다시 켠 것을 모르면 "다시 켜면 돌아옵니다" 가 거짓이 된다.
    useFeatures.setState({ features: { 'tools.memo': false }, loaded: true });
    mockGet.mockResolvedValue({ data: { success: true, data: { 'tools.memo': true } } });

    show();

    expect(await screen.findByText('메모 화면')).toBeInTheDocument();
    expect(screen.queryByText('메모 기능이 꺼져 있습니다.')).not.toBeInTheDocument();
  });

  it('여전히 꺼져 있으면 안내를 띄우고 되묻기를 반복하지 않는다', async () => {
    useFeatures.setState({ features: { 'tools.memo': false }, loaded: true });
    mockGet.mockResolvedValue({ data: { success: true, data: { 'tools.memo': false } } });

    show();

    expect(screen.getByText('메모 기능이 꺼져 있습니다.')).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 50));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('켜져 있는 기능의 화면에서는 묻지 않는다 — 양성 대조', async () => {
    show();
    await new Promise(r => setTimeout(r, 50));
    expect(mockGet).not.toHaveBeenCalled();
  });
});
