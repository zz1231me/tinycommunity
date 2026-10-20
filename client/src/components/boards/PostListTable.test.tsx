// client/src/components/boards/PostListTable.test.tsx
// 목록 표가 게시판 용도에 따라 무엇을 그리는지.
//
// 칼럼 수는 눈으로 세기 어렵다. 머리글과 각 행의 grid 칸 합이 어긋나면 화면이
// 한 칸씩 밀리는데, 스크린샷으로는 "왜 삐뚤지?" 까지밖에 알 수 없다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PostListTable } from './PostListTable';
import type { Post } from '../../types/board.types';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
}));

const base: Post = {
  id: 'p1',
  title: '첫 글',
  createdAt: '2026-01-01T00:00:00.000Z',
  author: '작성자',
  commentCount: 0,
};

function draw(posts: Post[], showTasks: boolean) {
  return render(
    <MemoryRouter>
      <PostListTable
        posts={posts}
        currentPage={1}
        pagination={null}
        postHref={id => `/dashboard/posts/qa/${id}`}
        listHref="/dashboard/posts/qa?page=2"
        onPageChange={vi.fn()}
        formatDate={() => '방금 전'}
        showTasks={showTasks}
      />
    </MemoryRouter>
  );
}

/**
 * 넓은 화면에서 머리글과 각 행이 차지하는 grid 칸의 합.
 * 서로 다르면 칼럼이 한 칸씩 밀린다.
 * 좁은 화면 전용 칸(sm:hidden)은 넓은 화면에서 사라지므로 세지 않는다.
 */
function desktopSpanTotals(container: HTMLElement): number[] {
  return [...container.querySelectorAll('[role="row"], .grid-cols-12')].map(row =>
    [...row.children].reduce((sum, cell) => {
      const classes = [...cell.classList];
      if (classes.includes('sm:hidden')) return sum;
      const cls =
        classes.find(c => c.startsWith('sm:col-span-')) ??
        classes.find(c => c.startsWith('col-span-'));
      return sum + (cls ? Number(cls.replace(/.*col-span-/, '')) : 0);
    }, 0)
  );
}

describe('일반 게시판', () => {
  const posts = [{ ...base, workStatus: 'todo' as const, assignee: { id: 'u1', name: '김담당' } }];

  it('업무용이 아니면 상태 배지를 그리지 않는다 — 값이 남아 있어도', () => {
    // 업무용을 껐는데 예전 배지가 남으면, 끈 것 같지 않다
    draw(posts, false);
    expect(screen.queryByText('할 일')).toBeNull();
  });

  it('담당자 칼럼도 없다', () => {
    draw(posts, false);
    expect(screen.queryByText('담당자')).toBeNull();
  });
});

describe('업무용 게시판', () => {
  it('상태 배지와 담당자 칼럼이 함께 나온다', () => {
    draw([{ ...base, workStatus: 'todo', assignee: { id: 'u1', name: '김담당' } }], true);
    expect(screen.getByText('할 일')).toBeTruthy();
    // 칼럼 머리글과 그 칸에 들어간 이름이 둘 다 보여야 한다
    expect(screen.getByText('담당자')).toBeTruthy();
    expect(screen.getByText('김담당')).toBeTruthy();
  });

  it('아직 아무도 안 쓰면 담당자 칼럼은 자리를 차지하지 않는다', () => {
    // 켜 두기만 한 게시판에 빈 칼럼을 두면 제목 폭만 좁아진다
    draw([base], true);
    expect(screen.queryByText('담당자')).toBeNull();
  });

  it('머리글과 행의 칸 합이 같다 — 담당자 칼럼이 있을 때', () => {
    const { container } = draw(
      [{ ...base, workStatus: 'doing', assignee: { id: 'u1', name: '김담당' } }],
      true
    );
    const totals = desktopSpanTotals(container);
    expect(totals.length).toBeGreaterThan(1);
    expect(new Set(totals).size).toBe(1);
  });

  it('머리글과 행의 칸 합이 같다 — 담당자 칼럼이 없을 때', () => {
    const { container } = draw([base], true);
    expect(new Set(desktopSpanTotals(container)).size).toBe(1);
  });
});

// 목록의 줄은 진짜 링크여야 한다.
//
// div 에 onClick 만 달려 있던 때는 ⌘-클릭이 새 탭을 열지 않고 보던 목록을 덮었다
// (브라우저로 실측: 탭이 늘지 않고 현재 탭이 상세로 갔다). 게시판에서 글 몇 개를
// 탭으로 열어 두는 건 흔한 일인데 그게 안 됐고, 링크 주소 복사도 우클릭 메뉴에
// 뜨지 않았다. 그래서 '줄에 href 가 있는가' 를 고정한다.
describe('목록 줄', () => {
  it('글 주소를 가진 링크다 — ⌘-클릭으로 새 탭에 열 수 있게', () => {
    draw([base], false);

    const row = screen.getByRole('link', { name: /첫 글/ });
    expect(row.getAttribute('href')).toBe('/dashboard/posts/qa/p1');
  });

  it('고정 글도 마찬가지다', () => {
    draw([{ ...base, id: 'p9', title: '공지', isPinned: true }], false);

    expect(screen.getByRole('link', { name: /공지/ }).getAttribute('href')).toBe(
      '/dashboard/posts/qa/p9'
    );
  });
});
