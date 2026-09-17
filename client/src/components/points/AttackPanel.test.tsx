// client/src/components/points/AttackPanel.test.tsx
//
// 퇴근 공격권을 보내는 화면. 출퇴근 화면에 있던 것을 포인트 화면으로 옮기면서
// 함께 온 규칙들이다 — 포인트가 드는 버튼이라 "못 사는데 눌리는" 상태가 없어야 하고,
// 거절당했을 때 고른 사람과 쓴 글이 날아가면 안 된다.
//
// 옮기면서 이 판이 직접 조회하게 됐으므로, 불러오기 실패와 잔액 갱신 신호가 새로 붙는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttackPanel } from './AttackPanel';
import type { AttackState } from '../../api/attendance';

const mockFetchAttackState = vi.fn();
const mockSendAttack = vi.fn();

vi.mock('../../api/attendance', () => ({
  fetchAttackState: () => mockFetchAttackState(),
  sendAttack: (body: unknown) => mockSendAttack(body),
}));

vi.mock('../common/UserPicker', () => ({
  UserPicker: ({
    selected,
    onChange,
  }: {
    selected: Array<{ id: string; name: string }>;
    onChange: (next: Array<{ id: string; name: string }>) => void;
  }) => (
    <button type="button" onClick={() => onChange([{ id: 'victim', name: '피해자' }])}>
      {selected.length > 0 ? `고름:${selected[0].name}` : '상대 고르기'}
    </button>
  ),
}));

vi.mock('../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const state = (over: Partial<AttackState> = {}): AttackState => ({
  rules: {
    cost: 300,
    popupCost: 150,
    defendCost: 200,
    blockSeconds: 60,
    dailyLimit: 5,
    messageMaxLength: 40,
  },
  balance: 1000,
  incoming: null,
  popup: null,
  usedToday: 0,
  remainingToday: 5,
  ...over,
});

/** 조회가 끝나 판이 그려질 때까지 기다린다 */
const show = async (onSpent?: () => void) => {
  render(<AttackPanel myId="me" onSpent={onSpent} />);
  await screen.findByRole('button', { name: '상대 고르기' });
};

const sendBtn = () => screen.getByRole('button', { name: /보내기|모두 사용|모자랍니다/ });

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAttackState.mockResolvedValue(state());
  mockSendAttack.mockResolvedValue({ id: 1 });
});

describe('공격 보내기', () => {
  it('기록은 건드리지 않는다고 분명히 적어 둔다', async () => {
    // 이 문구가 사라지면 사람들은 남의 근무 기록이 밀린다고 오해한다
    await show();
    expect(screen.getByText(/실제로 누른 순간 그대로/)).toBeInTheDocument();
  });

  it('상대를 고르기 전에는 보낼 수 없다', async () => {
    await show();
    expect(sendBtn()).toBeDisabled();
  });

  it('기본은 방해 — 고른 사람에게 chaos 로 간다', async () => {
    await show();

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() =>
      expect(mockSendAttack).toHaveBeenCalledWith({ targetId: 'victim', kind: 'chaos' })
    );
  });

  it('쪽지를 고르면 내용 칸이 생기고 그대로 실려 간다', async () => {
    await show();

    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    fireEvent.change(screen.getByLabelText('쪽지 내용'), { target: { value: '야근각' } });
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() =>
      expect(mockSendAttack).toHaveBeenCalledWith({
        targetId: 'victim',
        kind: 'popup',
        message: '야근각',
      })
    );
  });

  it('보내기에 실패하면 고른 사람과 쓴 글을 지우지 않는다', async () => {
    // 한도 초과·포인트 부족·이미 방해받는 중처럼 거절당하는 길이 여럿이다.
    // 보내기도 전에 비우면 실패할 때마다 사람을 다시 찾고 글을 다시 써야 한다.
    mockSendAttack.mockRejectedValue(new Error('한도 초과'));
    await show();

    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    fireEvent.change(screen.getByLabelText('쪽지 내용'), { target: { value: '야근각' } });
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() => expect(mockSendAttack).toHaveBeenCalled());
    expect(screen.getByLabelText('쪽지 내용')).toHaveValue('야근각');
    expect(screen.getByRole('button', { name: /고름:/ })).toBeInTheDocument();
  });

  it('보내고 나면 고른 사람과 쓴 글을 비운다 — 양성 대조', async () => {
    // 위 테스트만 있으면 '아무 때도 비우지 않는' 구현도 통과한다
    await show();

    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    fireEvent.change(screen.getByLabelText('쪽지 내용'), { target: { value: '야근각' } });
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() => expect(screen.getByLabelText('쪽지 내용')).toHaveValue(''));
    expect(screen.getByRole('button', { name: '상대 고르기' })).toBeInTheDocument();
  });

  it('쪽지 길이는 화면에서도 묶어 둔다', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    expect(screen.getByLabelText('쪽지 내용')).toHaveAttribute('maxlength', '40');
  });

  it('종류에 따라 값이 다르게 적힌다', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    expect(screen.getByRole('button', { name: /보내기.*300/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    expect(screen.getByRole('button', { name: /보내기.*150/ })).toBeInTheDocument();
  });

  it('오늘 다 썼으면 그렇게 말하고 막는다', async () => {
    mockFetchAttackState.mockResolvedValue(state({ remainingToday: 0, usedToday: 5 }));
    await show();
    expect(screen.getByRole('button', { name: /모두 사용/ })).toBeDisabled();
  });

  it('포인트가 모자라면 그렇게 말하고 막는다', async () => {
    mockFetchAttackState.mockResolvedValue(state({ balance: 10 }));
    await show();
    expect(screen.getByRole('button', { name: /포인트가 모자랍니다/ })).toBeDisabled();
  });
});

describe('포인트 화면으로 옮기면서 생긴 것', () => {
  it('보내고 나면 잔액을 다시 불러오라고 알린다', async () => {
    // 이 신호가 없으면 같은 화면 위쪽의 잔액만 그대로 남아, 한 화면에 서로 다른
    // 잔액이 둘 뜬다
    const onSpent = vi.fn();
    await show(onSpent);

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() => expect(onSpent).toHaveBeenCalledTimes(1));
  });

  it('보내지 못했으면 잔액을 다시 부르지 않는다 — 음성 대조', async () => {
    mockSendAttack.mockRejectedValue(new Error('한도 초과'));
    const onSpent = vi.fn();
    await show(onSpent);

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() => expect(mockSendAttack).toHaveBeenCalled());
    expect(onSpent).not.toHaveBeenCalled();
  });

  it('불러오지 못하면 비워 두지 않고 그렇게 말한다', async () => {
    // 빈 화면으로 두면 '공격권 기능이 없는 화면' 처럼 보인다
    mockFetchAttackState.mockRejectedValue(new Error('network down'));
    render(<AttackPanel myId="me" />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '상대 고르기' })).not.toBeInTheDocument();
  });
});
