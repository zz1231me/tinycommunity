// 대시보드 — 하루를 여는 한 장.
//
// 사이드바 첫 항목 이름은 '대시보드' 인데 누르면 공유 일정으로 갔다. 이름과 가는 곳이 달랐고
// 조망 화면은 없었다. 이 화면이 그 자리를 채운다.
//
// 지켜야 하는 선:
//  1. 새 자료를 만들지 않는다 — 이미 있는 길(내 업무·일정·최근 글)에서 모은다.
//  2. 관리자가 끈 기능의 칸은 아예 두지 않는다. 빈 상자만 남으면 꺼진 것인지 없는 것인지 모른다.
//  3. 한 칸이 실패해도 나머지는 보인다.
//  4. 비어 있으면 왜 비었는지 적는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithQuery } from '../test/renderWithQuery';

const fetchMyTasks = vi.hoisted(() => vi.fn());
const fetchRecentPosts = vi.hoisted(() => vi.fn());
const getEvents = vi.hoisted(() => vi.fn());
vi.mock('../api/tasks', async () => {
  const actual = await vi.importActual<typeof import('../api/tasks')>('../api/tasks');
  return { ...actual, fetchMyTasks };
});
vi.mock('../api/posts', () => ({ fetchRecentPosts }));
vi.mock('../api/events', () => ({ getEvents }));

const features = vi.hoisted(() => ({ on: new Set(['post.tasks', 'tools.calendar']) }));
vi.mock('../store/features', () => ({ useFeature: (key: string) => features.on.has(key) }));
vi.mock('../store/siteSettings', () => ({
  useSiteSettings: (sel: (s: { settings: { taskSoonDays: number } }) => unknown) =>
    sel({ settings: { taskSoonDays: 3 } }),
}));

import Overview from './Overview';

const task = (id: string, title: string, dueDate: string) => ({
  id,
  title,
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'todo' as const,
  priority: 'none' as const,
  assignee: null,
  canEdit: true,
  startDate: null,
  dueDate,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const show = () =>
  renderWithQuery(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  features.on = new Set(['post.tasks', 'tools.calendar']);
  fetchMyTasks.mockResolvedValue([]);
  fetchRecentPosts.mockResolvedValue([]);
  getEvents.mockResolvedValue([]);
});

describe('대시보드', () => {
  it('세 칸을 한 장에 놓는다', async () => {
    show();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '내 업무' })).toBeInTheDocument()
    );
    expect(screen.getByRole('heading', { name: '오늘 일정' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '새 글' })).toBeInTheDocument();
  });

  it('마감이 걸린 내 업무를 모은다', async () => {
    const past = '2020-01-01';
    fetchMyTasks.mockResolvedValue([task('1', '지난 보고서', past)]);
    show();
    await waitFor(() => expect(screen.getByText('지난 보고서')).toBeInTheDocument());
    // 지난 것은 몇 건인지 먼저 말한다
    expect(screen.getByText(/마감이 지난 일 1건/)).toBeInTheDocument();
  });

  it('업무 기능을 끄면 그 칸을 두지 않는다 — 빈 상자를 남기지 않는다', async () => {
    features.on = new Set(['tools.calendar']);
    show();
    await waitFor(() => expect(screen.getByRole('heading', { name: '새 글' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: '내 업무' })).toBeNull();
    expect(fetchMyTasks).not.toHaveBeenCalled();
  });

  it('일정 기능을 끄면 그 칸을 두지 않는다', async () => {
    features.on = new Set(['post.tasks']);
    show();
    await waitFor(() => expect(screen.getByRole('heading', { name: '새 글' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: '오늘 일정' })).toBeNull();
    expect(getEvents).not.toHaveBeenCalled();
  });

  it('한 칸이 실패해도 나머지는 보인다', async () => {
    getEvents.mockRejectedValue(new Error('네트워크'));
    fetchRecentPosts.mockResolvedValue([
      {
        id: 'p1',
        title: '새 공지',
        boardType: 'notice',
        boardName: '공지사항',
        authorName: '관리자',
        isSecret: false,
        isRead: false,
        createdAt: '2026-10-20T00:00:00.000Z',
      },
    ]);
    show();
    await waitFor(() =>
      expect(screen.getByText('일정을 불러오지 못했습니다.')).toBeInTheDocument()
    );
    expect(screen.getByText('새 공지')).toBeInTheDocument();
  });

  it('비어 있으면 왜 비었는지 적는다', async () => {
    show();
    await waitFor(() =>
      expect(screen.getByText('오늘 예정된 일정이 없습니다.')).toBeInTheDocument()
    );
    expect(screen.getByText('아직 새 글이 없습니다.')).toBeInTheDocument();
  });
});
