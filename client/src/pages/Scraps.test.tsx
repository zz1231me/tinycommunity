// client/src/pages/Scraps.test.tsx
//
// 이상한 답을 받아도 페이지가 살아 있는가.
//
// data?.posts.length 는 data 만 지켜 준다. posts 나 pagination 이 없으면 그 자리에서 터졌고,
// 이 앱에는 화면별 오류 울타리가 없어 페이지 전체가 하얗게 됐다(브라우저로 띄워 보다 찾았다).

import { createElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Scraps from './Scraps';
import { discoveryKeys } from '../api/queryKeys';

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

const fetchMyScraps = vi.hoisted(() => vi.fn());
vi.mock('../api/discovery', () => ({ fetchMyScraps }));

const show = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Scraps />
      </MemoryRouter>
    </QueryClientProvider>
  );
  // 답이 도착해 그 답으로 그린 뒤를 봐야 한다
  await waitFor(() =>
    expect(client.getQueryState(discoveryKeys.scraps.list(1))?.status).not.toBe('pending')
  );
};

beforeEach(() => vi.clearAllMocks());

describe('스크랩 목록이 이상한 답을 받아도', () => {
  it.each([
    ['배열만 온 경우', []],
    ['posts 가 빠진 경우', { pagination: { totalPages: 1, currentPage: 1 } }],
    ['pagination 이 빠진 경우', { posts: [] }],
    ['null', null],
  ])('%s — 페이지가 살아 있다', async (_name, payload) => {
    fetchMyScraps.mockResolvedValue(payload);

    await show();

    expect(screen.getByText('스크랩')).toBeInTheDocument();
    expect(screen.getByText(/아직 스크랩한 글이 없습니다/)).toBeInTheDocument();
  });

  it('제대로 된 답은 그대로 보여 준다 — 대조', async () => {
    fetchMyScraps.mockResolvedValue({
      posts: [
        {
          id: 'P1',
          title: '담아 둔 글',
          boardType: 'notice',
          boardName: '공지사항',
          author: '나',
          createdAt: new Date().toISOString(),
          views: 1,
          likeCount: 0,
          commentCount: 0,
        },
      ],
      pagination: { totalPages: 1, currentPage: 1 },
    });

    await show();

    expect(screen.getByText('담아 둔 글')).toBeInTheDocument();
  });
});
