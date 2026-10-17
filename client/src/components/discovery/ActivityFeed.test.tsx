// 한곳에서 보는 활동 피드.
//
// 지켜야 할 선: ① 종류마다 무슨 일인지 사람 말로 적는다 ② 누르면 그 글로 간다
// ③ 한 쪽을 다 받았으면 '더 보기' 로 이어 보고, 그때 마지막 줄의 시각을 집는다
// ④ 비어 있으면 그렇게 말한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActivityFeed } from './ActivityFeed';
import { renderWithQuery } from '../../test/renderWithQuery';
import type { ActivityItem } from '../../api/activity';

const api = vi.hoisted(() => ({ fetchActivity: vi.fn() }));
vi.mock('../../api/activity', () => api);
vi.mock('../tasks/useStatusLabel', () => ({
  useStatusLabel: () => (status: string) => ({ doing: '진행 중', done: '완료' })[status] ?? status,
}));

const item = (over: Partial<ActivityItem> = {}): ActivityItem => ({
  id: 'post:A1',
  kind: 'post',
  at: '2026-10-17T00:00:00.000Z',
  actor: { id: 'u1', name: '점검용a' },
  postId: 'A1',
  postTitle: '첫 글',
  boardType: 'notice',
  boardName: '공지사항',
  ...over,
});

const show = () =>
  renderWithQuery(
    <MemoryRouter>
      <ActivityFeed />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchActivity.mockResolvedValue([item()]);
});

describe('활동 피드', () => {
  it('새 글·댓글·업무 변경을 사람 말로 적는다', async () => {
    api.fetchActivity.mockResolvedValue([
      item(),
      item({ id: 'c1', kind: 'comment', postTitle: '댓글 글' }),
      item({ id: 't1', kind: 'task', change: 'status', toValue: 'doing', postTitle: '업무 글' }),
      item({ id: 't2', kind: 'task', change: 'priority', toValue: 'urgent', postTitle: '급한 글' }),
    ]);
    show();

    expect(await screen.findByText(/공지사항 · 새 글/)).toBeInTheDocument();
    expect(screen.getByText(/공지사항 · 댓글/)).toBeInTheDocument();
    expect(screen.getByText(/진행 중\(으\)로 옮김/)).toBeInTheDocument();
    expect(screen.getByText(/우선순위를 긴급\(으\)로/)).toBeInTheDocument();
  });

  it('누르면 그 글로 간다', async () => {
    show();
    const link = await screen.findByRole('link', { name: /첫 글/ });
    expect(link).toHaveAttribute('href', '/dashboard/posts/notice/A1');
  });

  it('아직 아무 일도 없으면 그렇게 말한다', async () => {
    api.fetchActivity.mockResolvedValue([]);
    show();
    expect(await screen.findByText('아직 쌓인 활동이 없습니다.')).toBeInTheDocument();
  });

  it('한 쪽이 덜 찼으면 더 보기를 주지 않는다', async () => {
    show();
    await screen.findByText(/첫 글/);
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('한 쪽을 꽉 채웠으면 마지막 줄의 시각부터 이어 본다', async () => {
    const page = Array.from({ length: 20 }, (_, i) =>
      item({
        id: `post:${i}`,
        postId: `P${i}`,
        postTitle: `글 ${i}`,
        at: `2026-10-${String(17 - i).padStart(2, '0')}T00:00:00.000Z`,
      })
    );
    api.fetchActivity.mockResolvedValueOnce(page);
    show();

    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));

    await waitFor(() =>
      expect(api.fetchActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ before: page[19].at }),
        expect.anything()
      )
    );
  });

  it('이어 받은 줄을 아래에 잇고, 겹치는 줄은 한 번만 그린다', async () => {
    const page = Array.from({ length: 20 }, (_, i) =>
      item({ id: `post:${i}`, postId: `P${i}`, postTitle: `글 ${i}` })
    );
    // 서버가 경계에서 같은 줄(마지막 줄)을 다시 주는 경우까지 같이 본다
    api.fetchActivity.mockImplementation(async (params: { before?: string }) =>
      params?.before ? [page[19], item({ id: 'post:새것', postTitle: '더 온 글' })] : page
    );
    show();

    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));

    expect(await screen.findByText('더 온 글')).toBeInTheDocument();
    expect(screen.getAllByText('글 19')).toHaveLength(1);
  });
});
