// client/src/components/discovery/RelatedPosts.test.tsx
//
// 곁다리 카드가 본문을 끌어내리지 않는가.
//
// 이 화면에는 자체 오류 울타리가 없다. 관련 글 목록이 배열이 아닌 답을 받으면(서버가 모양을
// 바꾸거나 오류 봉투가 오는 경우) map 에서 터져 글 전체가 하얗게 됐다 — 관련 글은 없어도
// 그만인 곁다리인데 본문까지 함께 사라진다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RelatedPosts } from './RelatedPosts';
import { discoveryKeys } from '../../api/queryKeys';

const fetchRelatedPosts = vi.hoisted(() => vi.fn());
vi.mock('../../api/discovery', () => ({ fetchRelatedPosts }));

const KEY = discoveryKeys.related('notice', 'P1');

const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <p>본문은 그대로</p>
        <RelatedPosts boardType="notice" postId="P1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
  // 답이 도착해 '그 답으로 그린 뒤' 를 봐야 한다 — 호출만 기다리면 터지기 전에 검사가 끝난다
  return waitFor(() => expect(client.getQueryState(KEY)?.status).not.toBe('pending'));
};

beforeEach(() => vi.clearAllMocks());

describe('관련 글이 이상한 답을 받아도', () => {
  it.each([
    ['객체', { posts: [] }],
    ['문자열', 'nope'],
    ['null', null],
  ])('%s 이 와도 터지지 않고 그 칸만 비운다', async (_name, payload) => {
    fetchRelatedPosts.mockResolvedValue(payload);

    await show();

    expect(screen.getByText('본문은 그대로')).toBeInTheDocument();
    expect(screen.queryByText('관련 글')).not.toBeInTheDocument();
  });

  it('제대로 된 목록은 그대로 보여 준다 — 대조', async () => {
    fetchRelatedPosts.mockResolvedValue([
      {
        id: 'P2',
        title: '비슷한 글',
        boardType: 'notice',
        boardName: '공지사항',
        author: '나',
        createdAt: new Date().toISOString(),
        views: 1,
        likeCount: 0,
        commentCount: 0,
      },
    ]);

    await show();

    expect(await screen.findByText('관련 글')).toBeInTheDocument();
    expect(screen.getByText('비슷한 글')).toBeInTheDocument();
  });
});
