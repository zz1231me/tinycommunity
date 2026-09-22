// 포인트 절반 날리기 판.
//
// 이 판은 눌리는 순간 포인트가 빠지고 되돌릴 수 없다. 그래서 지켜야 할 선이 둘이다 —
// 못 사는데 눌리는 상태가 없어야 하고, 무슨 일이 일어나는지(절반이 사라진다, 값은 안
// 돌아온다, 상대는 누군지 모른다)를 누르기 전에 적어 두어야 한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HalvePanel } from './HalvePanel';
import { renderWithQuery } from '../../test/renderWithQuery';
import type { PointAttackState } from '../../api/points';

const mockFetchState = vi.fn();
const mockHalve = vi.fn();

vi.mock('../../api/points', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/points')>()),
  fetchPointAttackState: () => mockFetchState(),
  halvePoints: (targetId: string) => mockHalve(targetId),
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

const state = (over: Partial<PointAttackState> = {}): PointAttackState => ({
  cost: 300,
  successPercent: 1,
  balance: 1000,
  dailyLimit: 5,
  usedToday: 0,
  remainingToday: 5,
  ...over,
});

const show = async (onSpent?: () => void) => {
  renderWithQuery(<HalvePanel myId="me" onSpent={onSpent} />);
  await screen.findByRole('button', { name: '상대 고르기' });
};

const throwBtn = () => screen.getByRole('button', { name: /던지기|모두 사용|모자랍니다/ });
const pick = () => fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchState.mockResolvedValue(state());
  mockHalve.mockResolvedValue({ succeeded: false, targetName: '피해자', balance: 700 });
});

describe('누르기 전에 알려 주는 것', () => {
  it('확률과 값, 돌려받지 못한다는 사실을 적어 둔다', async () => {
    await show();
    expect(screen.getByText(/1% 확률로 통합니다/)).toBeInTheDocument();
    expect(screen.getByText(/빗나가도 낸 값은 돌아오지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /던지기/ })).toHaveTextContent('300');
  });

  it('익명이라는 것을 분명히 적어 둔다', async () => {
    // 이 문구가 사라지면 사람들은 상대가 자기를 알아본다고 오해한다
    await show();
    expect(screen.getByText(/누가 걸었는지는 알 수 없습니다/)).toBeInTheDocument();
    // 나도 얼마가 날아갔는지 모른다는 것까지 적어 둔다
    expect(screen.getByText(/얼마가 사라졌는지는 알 수 없습니다/)).toBeInTheDocument();
  });

  it('날린 포인트가 내게 오지 않는다고 적어 둔다', async () => {
    await show();
    expect(screen.getByText(/내게 오지는 않습니다/)).toBeInTheDocument();
  });
});

describe('던질 수 없는 상태', () => {
  it('상대를 고르기 전에는 누를 수 없다', async () => {
    await show();
    expect(throwBtn()).toBeDisabled();
  });

  it('포인트가 모자라면 누를 수 없다', async () => {
    mockFetchState.mockResolvedValue(state({ balance: 299 }));
    await show();
    pick();
    expect(throwBtn()).toBeDisabled();
    expect(throwBtn()).toHaveTextContent('모자랍니다');
  });

  it('오늘 횟수를 다 썼으면 누를 수 없다', async () => {
    mockFetchState.mockResolvedValue(state({ remainingToday: 0, usedToday: 5 }));
    await show();
    pick();
    expect(throwBtn()).toBeDisabled();
    expect(throwBtn()).toHaveTextContent('모두 사용');
  });

  it('불러오지 못하면 판을 열지 않는다', async () => {
    mockFetchState.mockRejectedValue(new Error('끊김'));
    renderWithQuery(<HalvePanel myId="me" />);
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /던지기/ })).not.toBeInTheDocument();
  });
});

describe('던진 결과', () => {
  it('통하면 통했다고만 알려 준다 — 액수는 말하지 않는다', async () => {
    // 절반을 알려 주면 상대의 잔액을 그대로 알려 주는 셈이라 서버가 아예 보내지 않는다.
    mockHalve.mockResolvedValue({ succeeded: true, targetName: '피해자', balance: 700 });
    await show();
    pick();
    fireEvent.click(throwBtn());

    const hit = await screen.findByText(/명중!/);
    expect(hit).toHaveTextContent('포인트 절반이 사라졌습니다');
    expect(hit.textContent ?? '').not.toMatch(/\d/);
    await waitFor(() => expect(mockHalve).toHaveBeenCalledWith('victim'));
  });

  it('빗나가면 아무 일도 없었다고 알려 준다', async () => {
    await show();
    pick();
    fireEvent.click(throwBtn());

    expect(await screen.findByText(/빗나갔습니다/)).toBeInTheDocument();
  });

  it('던진 뒤 잔액을 다시 읽도록 알린다', async () => {
    const onSpent = vi.fn();
    await show(onSpent);
    pick();
    fireEvent.click(throwBtn());

    await waitFor(() => expect(onSpent).toHaveBeenCalled());
  });

  it('거절당하면 고른 사람을 그대로 둔다 — 다시 고르게 하지 않는다', async () => {
    mockHalve.mockRejectedValue(new Error('오늘은 모두 사용했습니다.'));
    await show();
    pick();
    fireEvent.click(throwBtn());

    await waitFor(() => expect(mockHalve).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '고름:피해자' })).toBeInTheDocument();
  });
});
