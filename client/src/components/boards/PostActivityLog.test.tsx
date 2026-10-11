// 활동 기록의 일정 줄. 서버는 '시작~마감' 한 줄로 적고, 화면은 읽는 글로 바꾼다.

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { PostActivityLog } from './PostActivityLog';
import type { ActivityEntry } from '../../api/tasks';

const api = vi.hoisted(() => ({ fetchActivity: vi.fn(), fetchWorkStatuses: vi.fn() }));
vi.mock('../../api/tasks', async () => {
  const actual = await vi.importActual<typeof import('../../api/tasks')>('../../api/tasks');
  return { ...actual, ...api };
});

const entry = (id: string, from: string | null, to: string | null): ActivityEntry => ({
  id: `schedule:${id}`,
  kind: 'schedule',
  at: '2026-10-11T01:00:00.000Z',
  actor: { id: 'u1', name: '홍길동' },
  from: { value: from, label: from },
  to: { value: to, label: to },
});

describe('PostActivityLog 일정 줄', () => {
  it('정함·바꿈·지움을 문장으로 적는다', async () => {
    api.fetchWorkStatuses.mockResolvedValue([]);
    api.fetchActivity.mockResolvedValue([
      entry('3', '2026-10-01~2026-10-03', null),
      entry('2', '2026-10-01~2026-10-03', '~2026-10-05'),
      entry('1', null, '2026-10-01~2026-10-03'),
    ]);
    renderWithQuery(<PostActivityLog boardType="qc" postId="P1" />);

    expect(await screen.findByText(/일정을 지웠습니다/)).toBeInTheDocument();
    expect(
      screen.getByText(/일정을 2026-10-01 ~ 2026-10-03 → 2026-10-05 로 바꿨습니다/)
    ).toBeInTheDocument();
    expect(screen.getByText(/일정을 2026-10-01 ~ 2026-10-03 로 정했습니다/)).toBeInTheDocument();
  });
});
