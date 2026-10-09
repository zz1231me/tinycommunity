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
  halvePoints: (targetId: string, count?: number) => mockHalve(targetId, count),
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
  lossPercent: 50,
  maxBurst: 10,
  balance: 1000,
  dailyLimit: 5,
  usedToday: 0,
  remainingToday: 5,
  ...over,
});

/** 서버가 돌려주는 모양. 던진 횟수만큼 결과가 줄줄이 온다. */
const result = (
  throws: Array<{ succeeded: boolean; lost: number }>,
  stopped: string | null = null
) => ({
  throws,
  stopped,
  targetName: '피해자',
  balance: 700,
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
  mockHalve.mockResolvedValue(result([{ succeeded: false, lost: 0 }]));
});

describe('누르기 전에 알려 주는 것', () => {
  it('확률과 값, 돌려받지 못한다는 사실을 적어 둔다', async () => {
    await show();
    expect(screen.getByText(/1% 확률로 통합니다/)).toBeInTheDocument();
    // 비율도 관리자가 바꾼다 — 화면이 '절반' 으로 굳어 있으면 설정과 어긋난다
    expect(screen.getByText(/50% 가 그대로 사라집니다/)).toBeInTheDocument();
    expect(screen.getByText(/빗나가도 낸 값은 돌아오지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /던지기/ })).toHaveTextContent('300');
  });

  it('익명이라는 것을 분명히 적어 둔다', async () => {
    // 이 문구가 사라지면 사람들은 상대가 자기를 알아본다고 오해한다
    await show();
    expect(screen.getByText(/누가 걸었는지는 알 수 없습니다/)).toBeInTheDocument();
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
  it('통하면 몇 점을 날렸는지 알려 준다', async () => {
    mockHalve.mockResolvedValue(result([{ succeeded: true, lost: 1234 }]));
    await show();
    pick();
    fireEvent.click(throwBtn());

    // 판 안의 결과 줄. 같은 '명중' 이 축하 연출에도 뜨므로 역할로 집어 고른다.
    const hit = await screen.findByRole('status');
    expect(hit).toHaveTextContent('1,234');
    await waitFor(() => expect(mockHalve).toHaveBeenCalledWith('victim', 1));
  });

  it('통하면 크게 터뜨린다 — 100 번에 한 번이라 조용히 지나가면 섭섭하다', async () => {
    mockHalve.mockResolvedValue(result([{ succeeded: true, lost: 1234 }]));
    await show();
    pick();
    fireEvent.click(throwBtn());

    expect(await screen.findByText('💣 명중!')).toBeInTheDocument();
    expect(screen.getByText(/1,234P 증발/)).toBeInTheDocument();
  });

  it('빗나가면 터뜨리지 않는다 — 양성 대조', async () => {
    await show();
    pick();
    fireEvent.click(throwBtn());

    await screen.findByRole('status');
    expect(screen.queryByText('💣 명중!')).not.toBeInTheDocument();
  });

  it('통했는데 상대가 빈털터리면 그렇게 말한다 — 0P 가 사라졌다고 하지 않는다', async () => {
    mockHalve.mockResolvedValue(result([{ succeeded: true, lost: 0 }]));
    await show();
    pick();
    fireEvent.click(throwBtn());

    expect(await screen.findByText(/날릴 포인트가 없었습니다/)).toBeInTheDocument();
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

  it('x10 은 요청 한 번으로 열 발을 보낸다 — 열 번 부르면 서버가 줄을 선다', async () => {
    const shots = Array.from({ length: 10 }, (_, i) => ({
      succeeded: i === 3,
      lost: i === 3 ? 500 : 0,
    }));
    mockHalve.mockResolvedValue(result(shots));
    // 잔액과 남은 횟수가 적으면 묶음 수가 그만큼 줄어든다 — 여기서 볼 것이 아니다
    mockFetchState.mockResolvedValue(state({ balance: 100_000, remainingToday: 10 }));
    await show();
    pick();

    fireEvent.click(screen.getByRole('button', { name: /x10/ }));

    await waitFor(() => expect(mockHalve).toHaveBeenCalledWith('victim', 10));
    expect(mockHalve).toHaveBeenCalledTimes(1);
    // 열 발 중 한 발만 맞았으니 합계가 보인다.
    // 한 발씩 보여 준 뒤에야 요약이 뜨므로 기본 대기(1초)보다 길게 준다.
    expect(await screen.findByRole('status', {}, { timeout: 5000 })).toHaveTextContent('500');
  });

  it('남은 횟수보다 많이 적어 두지 않는다', async () => {
    mockFetchState.mockResolvedValue(state({ remainingToday: 3, balance: 100_000 }));
    await show();
    pick();
    expect(screen.getByRole('button', { name: /x3/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /x10/ })).not.toBeInTheDocument();
  });

  it('남은 횟수가 한 번뿐이면 묶음 단추를 숨긴다', async () => {
    mockFetchState.mockResolvedValue(state({ remainingToday: 1, balance: 100_000 }));
    await show();
    pick();
    expect(screen.queryByRole('button', { name: /^x\d/ })).not.toBeInTheDocument();
  });

  it('가진 포인트로 던질 수 있는 만큼만 적어 둔다', async () => {
    // 1,000P 에 한 발 300P 면 세 발이 한계다. x10 을 적어 두면 눌러 봐야 중간에 멈춘다.
    mockFetchState.mockResolvedValue(state({ balance: 1000, remainingToday: 10 }));
    await show();
    pick();
    expect(screen.getByRole('button', { name: /x3/ })).toBeInTheDocument();
  });

  it('던진 뒤에도 남아 있어 이름을 다시 치지 않고 또 던진다', async () => {
    // 100 번에 한 번 통하는 공격이라 같은 사람에게 거듭 던지게 된다.
    await show();
    pick();
    fireEvent.click(throwBtn());
    await waitFor(() => expect(mockHalve).toHaveBeenCalledTimes(1));

    // 던지는 동안은 잠겨 있다. 풀릴 때까지 기다리지 않고 누르면 무시되어 테스트가 흔들린다.
    await waitFor(() => expect(throwBtn()).toBeEnabled());

    expect(screen.getByRole('button', { name: '고름:피해자' })).toBeInTheDocument();
    fireEvent.click(throwBtn());
    await waitFor(() => expect(mockHalve).toHaveBeenCalledTimes(2));
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
