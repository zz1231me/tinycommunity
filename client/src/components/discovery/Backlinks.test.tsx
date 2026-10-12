// 이 글을 가리키는 글.
//
// 글이 흩어져 서로 이어지지 않는다는 말에서 나온 화면이다. 그래서 지켜야 할 선은
// '있을 때만 보이고, 없을 때는 자리를 차지하지 않는다' 와 '누르면 그 글로 간다' 다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Backlinks } from './Backlinks';
import { renderWithQuery } from '../../test/renderWithQuery';
import type { Backlink } from '../../api/discovery';

const mockFetch = vi.fn();
vi.mock('../../api/discovery', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/discovery')>()),
  fetchBacklinks: (boardType: string, postId: string) => mockFetch(boardType, postId),
}));

const item = (over: Partial<Backlink> = {}): Backlink => ({
  id: 'AAAA1111BBBB',
  title: '회의록 2026-10-12',
  boardType: 'notice',
  boardName: '공지사항',
  author: '관리자',
  createdAt: '2026-10-12T00:00:00.000Z',
  ...over,
});

const show = () =>
  renderWithQuery(
    <MemoryRouter>
      <Backlinks boardType="free" postId="TARGET123456" />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('이 글을 가리키는 글', () => {
  it('가리킨 글을 제목·게시판과 함께 보여 주고 그 글로 이어 준다', async () => {
    mockFetch.mockResolvedValue([item()]);
    show();

    const row = await screen.findByRole('link', { name: /회의록 2026-10-12/ });
    expect(row).toHaveAttribute('href', '/dashboard/posts/notice/AAAA1111BBBB');
    expect(screen.getByText('공지사항')).toBeInTheDocument();
  });

  it('몇 건인지 적어 둔다', async () => {
    mockFetch.mockResolvedValue([item(), item({ id: 'CCCC2222DDDD', title: '두 번째' })]);
    show();

    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('가리키는 글이 없으면 아무것도 그리지 않는다 — 빈 칸을 남기지 않게', async () => {
    mockFetch.mockResolvedValue([]);
    const { container } = show();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container.querySelector('section')).toBeNull();
  });

  it('불러오지 못해도 글 읽기를 방해하지 않는다', async () => {
    mockFetch.mockRejectedValue(new Error('끊김'));
    const { container } = show();

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(container.querySelector('section')).toBeNull();
  });

  it('지금 보는 글의 주소로 묻는다', async () => {
    mockFetch.mockResolvedValue([]);
    show();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('free', 'TARGET123456'));
  });
});
