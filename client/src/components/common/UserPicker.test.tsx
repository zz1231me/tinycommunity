// client/src/components/common/UserPicker.test.tsx
// 사람을 고르는 입력이 "못 찾은 것" 과 "못 불러온 것" 을 구분하는가.
//
// 조회가 실패해도 결과는 빈 배열로 돌아온다. 그대로 두면 '고를 수 있는 사람이 없습니다'
// 가 떠서, 담당자를 지정하려던 사람은 "그런 사람이 없구나" 라고 잘못 결론짓는다.
// 실제로 그렇게 보여 주고 있었다 — 관리자 로그 화면 네 곳에서 고쳤던 것과 같은 계열이다.
//
// 이 입력은 업무 담당자 지정(TaskPanel)과 글 작성 화면(PostEditor)에서 쓰인다.
// 잘못된 결론이 그대로 업무에 남는 자리라 문구를 고정해 둔다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { UserPicker } from './UserPicker';
import type { UserSuggestion } from '../../api/users';

const mockSearchUsers = vi.fn();
vi.mock('../../api/users', () => ({
  searchUsers: (q: string, signal?: AbortSignal, boardType?: string) =>
    mockSearchUsers(q, signal, boardType),
}));

const alice: UserSuggestion = { id: 'alice', name: '앨리스' };
const bobby: UserSuggestion = { id: 'bobby', name: '바비' };

const show = (props: Partial<React.ComponentProps<typeof UserPicker>> = {}) =>
  renderWithQuery(<UserPicker selected={[]} onChange={vi.fn()} {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('못 찾은 것과 못 불러온 것', () => {
  it('조회가 실패하면 실패했다고 말한다', async () => {
    mockSearchUsers.mockRejectedValue(new Error('네트워크 끊김'));

    show();

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    // '없습니다' 로 보이면 사용자가 "그런 사람이 없다" 고 잘못 결론짓는다
    expect(screen.queryByText(/고를 수 있는 사람이 없습니다/)).not.toBeInTheDocument();
  });

  it('결과가 정말 없을 때만 없다고 말한다', async () => {
    mockSearchUsers.mockResolvedValue([]);

    show();

    expect(await screen.findByText(/고를 수 있는 사람이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
  });
});

describe('고르기', () => {
  it('찾은 사람을 목록에 보여 준다', async () => {
    mockSearchUsers.mockResolvedValue([alice, bobby]);

    show();

    expect(await screen.findByRole('option', { name: /앨리스/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /바비/ })).toBeInTheDocument();
  });

  it('이미 고른 사람은 후보에서 뺀다', async () => {
    mockSearchUsers.mockResolvedValue([alice, bobby]);

    show({ selected: [alice] });

    expect(await screen.findByRole('option', { name: /바비/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /앨리스/ })).not.toBeInTheDocument();
  });

  it('제외 목록에 있는 사람도 후보에서 뺀다 — 보통 본인', async () => {
    mockSearchUsers.mockResolvedValue([alice, bobby]);

    show({ excludeIds: ['bobby'] });

    expect(await screen.findByRole('option', { name: /앨리스/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /바비/ })).not.toBeInTheDocument();
  });
});
