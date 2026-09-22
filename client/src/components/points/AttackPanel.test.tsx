// client/src/components/points/AttackPanel.test.tsx
//
// 퇴근 공격권을 보내는 화면. 출퇴근 화면에 있던 것을 포인트 화면으로 옮기면서
// 함께 온 규칙들이다 — 포인트가 드는 버튼이라 "못 사는데 눌리는" 상태가 없어야 하고,
// 거절당했을 때 고른 사람과 쓴 글이 날아가면 안 된다.
//
// 옮기면서 이 판이 직접 조회하게 됐으므로, 불러오기 실패와 잔액 갱신 신호가 새로 붙는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AttackPanel } from './AttackPanel';
import { renderWithQuery } from '../../test/renderWithQuery';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AttackState } from '../../api/attendance';

const mockFetchAttackState = vi.fn();
const mockSendAttack = vi.fn();

vi.mock('../../api/attendance', async importOriginal => ({
  // 얼굴·이름 같은 상수는 진짜를 쓴다 — 서버를 부르는 두 함수만 가짜다
  ...(await importOriginal<typeof import('../../api/attendance')>()),
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
    // 일부러 방해 값과 다르게 둔다. 같은 값이면 '종류에 따라 값이 다르게 적힌다' 가
    // 어느 쪽을 읽든 통과해, 아무것도 가려내지 못하는 테스트가 된다.
    hideCost: 250,
    defendCost: 200,
    blockSeconds: 60,
    hideSeconds: 10,
    dailyLimit: 5,
    maxStack: 10,
  },
  balance: 1000,
  incoming: null,
  queue: [],
  usedToday: 0,
  remainingToday: 5,
  ...over,
});

/** 조회가 끝나 판이 그려질 때까지 기다린다 */
const show = async (onSpent?: () => void) => {
  renderWithQuery(<AttackPanel myId="me" onSpent={onSpent} />);
  await screen.findByRole('button', { name: '상대 고르기' });
};

const sendBtn = () => screen.getByRole('button', { name: /보내기|모두 사용|모자랍니다/ });

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAttackState.mockResolvedValue(state());
  mockSendAttack.mockResolvedValue({
    id: 1,
    startsAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    stack: 1,
  });
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

  it('숨기기를 고르면 그 종류로 간다', async () => {
    await show();

    fireEvent.click(screen.getByRole('button', { name: /버튼 숨기기/ }));
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() =>
      expect(mockSendAttack).toHaveBeenCalledWith({ targetId: 'victim', kind: 'hide' })
    );
  });

  it('보내기에 실패하면 고른 사람을 지우지 않는다', async () => {
    // 한도 초과·포인트 부족·이미 방해받는 중처럼 거절당하는 길이 여럿이다.
    // 보내기도 전에 비우면 실패할 때마다 상대를 다시 찾아야 한다.
    mockSendAttack.mockRejectedValue(new Error('한도 초과'));
    await show();

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() => expect(mockSendAttack).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /고름:/ })).toBeInTheDocument();
  });

  it('보낸 뒤에도 남아 있어 이름을 다시 치지 않고 또 보낸다', async () => {
    // 같은 사람에게 이어 보내는 일이 많다. 보낼 때마다 비우면 매번 이름을 다시 쳐야 한다.
    await show();

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());
    await waitFor(() => expect(mockSendAttack).toHaveBeenCalledTimes(1));

    // 고르는 단계를 거치지 않고 곧바로 한 번 더
    expect(screen.getByRole('button', { name: /고름:/ })).toBeInTheDocument();
    fireEvent.click(sendBtn());
    await waitFor(() => expect(mockSendAttack).toHaveBeenCalledTimes(2));
  });

  it('종류에 따라 값이 다르게 적힌다', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    expect(screen.getByRole('button', { name: /보내기.*300/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /버튼 숨기기/ }));
    expect(screen.getByRole('button', { name: /보내기.*250/ })).toBeInTheDocument();
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
    renderWithQuery(<AttackPanel myId="me" />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '상대 고르기' })).not.toBeInTheDocument();
  });
});

describe('보낸 뒤의 손맛', () => {
  it('보내면 누구에게 명중했는지 튀어나온다', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    expect(await screen.findByText(/피해자님에게 명중/)).toBeInTheDocument();
  });

  it('앞에 쌓여 있으면 언제 걸리는지 말해 준다', async () => {
    // 줄을 서면 지금은 아무 일도 일어나지 않는다. 그런데도 '날뛰기 시작합니다' 라고만
    // 하면, 상대 화면이 멀쩡한 것을 보고 공격이 안 먹혔다고 읽는다.
    mockSendAttack.mockResolvedValue({
      id: 9,
      startsAt: new Date(Date.now() + 80_000).toISOString(),
      expiresAt: new Date(Date.now() + 140_000).toISOString(),
      stack: 3,
    });
    await show();
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    expect(await screen.findByText(/앞에 2개 대기/)).toBeInTheDocument();
    expect(screen.queryByText(/날뛰기 시작합니다/)).not.toBeInTheDocument();
  });

  it('바로 걸리면 그렇게 말한다 — 대조군', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    expect(await screen.findByText(/날뛰기 시작합니다/)).toBeInTheDocument();
  });

  it('거절당했으면 명중이라고 하지 않는다 — 음성 대조', async () => {
    mockSendAttack.mockRejectedValue(new Error('이미 방해받는 중'));
    await show();
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    await waitFor(() => expect(mockSendAttack).toHaveBeenCalled());
    expect(screen.queryByText(/명중/)).not.toBeInTheDocument();
  });
});

describe('같은 화면의 다른 판이 포인트를 움직이면', () => {
  it('잔액을 다시 읽는다', async () => {
    // 대결에서 이겨 포인트가 생겨도 여기 버튼은 '포인트가 모자랍니다' 로 막혀 있었다
    const { rerender, queryClient } = renderWithQuery(<AttackPanel myId="me" refreshSignal={0} />);
    await screen.findByRole('button', { name: '상대 고르기' });
    const before = mockFetchAttackState.mock.calls.length;

    rerender(
      <QueryClientProvider client={queryClient}>
        <AttackPanel myId="me" refreshSignal={1} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(mockFetchAttackState.mock.calls.length).toBeGreaterThan(before));
  });

  it('내 시계가 느려도 언제 걸리는지를 서버 기준으로 말한다', async () => {
    // 시계가 5분 느리면, 지금 걸리는 공격이 '5분 뒤에 걸립니다' 로 잘못 안내됐다.
    const serverNow = new Date(Date.now() + 5 * 60_000).toISOString();
    mockFetchAttackState.mockResolvedValue({ ...state(), now: serverNow });
    mockSendAttack.mockResolvedValue({
      id: 2,
      startsAt: serverNow, // 서버 기준으로는 지금 시작한다
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      stack: 1,
    });

    await show();
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(sendBtn());

    expect(await screen.findByText(/날뛰기 시작합니다/)).toBeInTheDocument();
    expect(screen.queryByText(/뒤에 걸립니다/)).not.toBeInTheDocument();
  });
});
