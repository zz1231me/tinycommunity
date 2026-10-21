// 목록에서 하위 업무를 접고 펼치는 자리.
//
// 줄 전체가 <a> 라서 펼치기 단추를 그 안에 둘 수 없다. 안에 두면 올바르지 않은
// 짜임새이기도 하지만, 무엇보다 **누르는 순간 링크를 따라가 상세로 넘어간다** —
// 펼쳐 볼 수가 없다. 그래서 단추는 링크 바깥에 나란히 둔다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostListTable } from './PostListTable';
import type { Post } from '../../types/board.types';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
}));

const fetchSubtasks = vi.hoisted(() => vi.fn());
vi.mock('../../api/tasks', () => ({ fetchSubtasks }));

const parent: Post = {
  id: 'p1',
  title: '현장 점검',
  createdAt: '2026-01-01T00:00:00.000Z',
  author: '작성자',
  commentCount: 0,
  workStatus: 'todo',
  subtaskCount: 2,
  subtaskDoneCount: 1,
};

const plain: Post = {
  id: 'p2',
  title: '그냥 글',
  createdAt: '2026-01-01T00:00:00.000Z',
  author: '작성자',
  commentCount: 0,
  subtaskCount: 0,
};

/**
 * 지금 주소를 글로 적어 둔다. MemoryRouter 는 window.location 을 건드리지 않으므로
 * location 으로는 넘어갔는지 알 수 없다 — 그걸 보고 있으면 어떤 구현이든 통과한다.
 */
function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function draw(posts: Post[] = [parent, plain]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard/posts/qa']}>
        <Where />
        <PostListTable
          posts={posts}
          currentPage={1}
          pagination={null}
          postHref={id => `/dashboard/posts/qa/${id}`}
          listHref="/dashboard/posts/qa"
          onPageChange={vi.fn()}
          formatDate={() => '방금 전'}
          showTasks
          boardType="qa"
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const toggle = () => screen.getByRole('button', { name: /현장 점검의 하위 업무/ });

beforeEach(() => {
  vi.clearAllMocks();
  fetchSubtasks.mockResolvedValue([
    {
      id: 'c1',
      title: '자재 확인',
      workStatus: 'todo',
      createdAt: '2026-01-02T00:00:00.000Z',
      assignee: null,
    },
  ]);
});

describe('목록의 하위 업무 펼치기', () => {
  it('하위가 있는 줄에만 펼치기 단추를 둔다', () => {
    draw();
    expect(toggle()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /그냥 글의 하위 업무/ })).toBeNull();
  });

  it('펼치기 전에도 몇 개 중 몇 개가 끝났는지 보인다', () => {
    draw();
    expect(screen.getByText('하위 1/2')).toBeInTheDocument();
  });

  // 이것이 이 구조의 핵심이다. 단추가 <a> 안에 있으면 여기서 상세로 넘어간다.
  it('펼치기 단추는 글 상세로 넘어가지 않는다', () => {
    draw();
    fireEvent.click(toggle());
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/posts/qa');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  // 대조군 — 제목을 누르면 실제로 넘어간다. 위 검사가 '아무것도 안 눌렸다' 로
  // 통과하는 것이 아님을 보인다.
  it('제목을 누르면 상세로 넘어간다', () => {
    draw();
    fireEvent.click(screen.getByRole('link', { name: /현장 점검/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/posts/qa/p1');
  });

  it('펼치면 하위가 상위 바로 아래로 들어온다', async () => {
    draw();
    fireEvent.click(toggle());
    await waitFor(() => expect(screen.getByText('자재 확인')).toBeInTheDocument());
    expect(fetchSubtasks).toHaveBeenCalledWith('qa', 'p1', expect.anything());

    // 상위 바로 다음에 와야 '딸린 것' 으로 읽힌다. 목록 맨 끝에 붙으면 뜻이 달라진다.
    const titles = screen.getAllByRole('heading').map(h => h.textContent);
    expect(titles).toEqual(['현장 점검', '자재 확인', '그냥 글']);
  });

  it('접기 전에는 하위를 받아 오지 않는다', () => {
    draw();
    expect(fetchSubtasks).not.toHaveBeenCalled();
  });

  it('다시 누르면 접히고 하위가 사라진다', async () => {
    draw();
    fireEvent.click(toggle());
    await waitFor(() => expect(screen.getByText('자재 확인')).toBeInTheDocument());
    fireEvent.click(toggle());
    expect(screen.queryByText('자재 확인')).toBeNull();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('거를 때 섞여 나온 하위 줄은 상위 제목을 달고 온다', () => {
    draw([
      { ...plain, id: 'c9', title: '자재 확인', parentTask: { id: 'p1', title: '현장 점검' } },
    ]);
    expect(screen.getByText('상위 · 현장 점검')).toBeInTheDocument();
  });
});
