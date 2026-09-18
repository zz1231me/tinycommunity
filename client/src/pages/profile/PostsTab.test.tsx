// client/src/pages/profile/PostsTab.test.tsx
//
// 내 게시글의 행은 진짜 링크다. 클릭만 받는 행이면 키보드로 열 수 없고,
// 새 탭에서 열기·주소 복사도 되지 않는다.

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithQuery } from '../../test/renderWithQuery';
import { PostsTab } from './PostsTab';

vi.mock('../../api/users', () => ({
  getMyPosts: vi.fn().mockResolvedValue({
    posts: [
      {
        id: 'p1',
        title: '첫 글',
        boardType: 'notice',
        isSecret: false,
        commentCount: 0,
        viewCount: 3,
        createdAt: new Date().toISOString(),
      },
    ],
    pagination: { totalPages: 1, currentPage: 1 },
  }),
}));

describe('내 게시글', () => {
  it('행이 그 글로 가는 링크다', async () => {
    renderWithQuery(
      <MemoryRouter>
        <PostsTab />
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: /첫 글/ })).toHaveAttribute(
      'href',
      '/dashboard/posts/notice/p1'
    );
  });
});
