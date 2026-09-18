// client/src/components/points/LotteryPanel.test.tsx
//
// 눈으로 확인하기 어려운 것들을 고정한다: 서버가 준 확률표를 그대로 보여주는지,
// 미당첨을 당첨처럼 그리지 않는지, 횟수를 다 쓰면 버튼이 막히는지,
// 한도 초과 응답을 사용자 말로 옮기는지.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LotteryPanel } from './LotteryPanel';
import type { DrawResult, PointStatus } from '../../api/points';

// framer-motion 의 애니메이션은 happy-dom 에서 취소될 때 잡히지 않는 AbortError 를 남긴다.
// 태그는 그대로 두고(테스트가 selector 로 p 를 찾는다) 애니메이션 속성만 걷어 낸다.
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      whileHover: _wh,
      whileTap: _wt,
      layout: _l,
      ...rest
    }: Record<string, unknown>) {
      return createElement(tag, rest);
    };
  // 태그별로 한 번만 만들어 재사용한다. 접근할 때마다 새 컴포넌트를 돌려주면
  // React 가 매 렌더마다 그 자리를 통째로 갈아 끼워, 방금 찾은 노드가 문서에서 떨어진다.
  const cache = new Map<string, ReturnType<typeof strip>>();
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) => {
          if (!cache.has(tag)) cache.set(tag, strip(tag));
          return cache.get(tag);
        },
      }
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
  };
});

const fetchPointStatus = vi.hoisted(() => vi.fn());
const fetchPointHistory = vi.hoisted(() => vi.fn());
const drawLottery = vi.hoisted(() => vi.fn());
vi.mock('../../api/points', () => ({ fetchPointStatus, fetchPointHistory, drawLottery }));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('../../utils/toast', () => ({
  toast: { success: toastSuccess, error: toastError, info: vi.fn(), warning: vi.fn() },
}));

const status = (over: Partial<PointStatus> = {}): PointStatus => ({
  balance: 1200,
  drawsToday: 2,
  dailyLimit: 10,
  drawsLeft: 8,
  attendanceBonus: 500,
  drawCost: 0,
  canAfford: true,
  attendanceClaimedToday: true,
  prizes: [
    { amount: 1500, weight: 3 },
    { amount: 1000, weight: 10 },
    { amount: 700, weight: 30 },
    { amount: 50, weight: 50 },
  ],
  blankWeight: 7,
  ...over,
});

const result = (over: Partial<DrawResult> = {}): DrawResult => ({
  amount: 700,
  cost: 0,
  isBlank: false,
  balance: 1900,
  drawsToday: 3,
  drawsLeft: 7,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchPointStatus.mockResolvedValue(status());
  fetchPointHistory.mockResolvedValue({ entries: [], total: 0, page: 1, totalPages: 1 });
});

describe('보여주는 값', () => {
  it('잔액과 남은 횟수를 서버 값 그대로 쓴다', async () => {
    render(<LotteryPanel />);
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(screen.getByText(/오늘 남은 뽑기 8\/10/)).toBeInTheDocument();
  });

  it('확률표를 그대로 보여주고, 남는 몫은 미당첨으로 적는다', async () => {
    render(<LotteryPanel />);
    expect(await screen.findByText('1,500P')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument();
    expect(screen.getByText('미당첨')).toBeInTheDocument();
    expect(screen.getByText('7%')).toBeInTheDocument();
  });

  it('확률 합이 100 이면 미당첨 줄을 만들지 않는다', async () => {
    fetchPointStatus.mockResolvedValue(
      status({ prizes: [{ amount: 100, weight: 100 }], blankWeight: 0 })
    );
    render(<LotteryPanel />);
    expect(await screen.findByText('100P')).toBeInTheDocument();
    expect(screen.queryByText('미당첨')).not.toBeInTheDocument();
  });
});

describe('뽑기', () => {
  it('당첨은 얻은 포인트를 보여준다', async () => {
    drawLottery.mockResolvedValue(result());
    fetchPointStatus.mockResolvedValueOnce(status()).mockResolvedValue(status({ balance: 1900 }));
    render(<LotteryPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
    // 결과가 뜨기 전에 숫자가 섞이는 시간(ROLL_MS)이 있다. 기본 1초로는 아슬아슬하다.
    expect(await screen.findByText('+700P', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('움직임을 줄인 설정이면 덮개 없이 바로 보여준다', async () => {
    // 덮개를 여는 동작을 할 수 없거나 원치 않는 사람이 결과를 못 보는 일이 없어야 한다.
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })) as unknown as typeof window.matchMedia;
    try {
      drawLottery.mockResolvedValue(result());
      render(<LotteryPanel />);
      fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
      // 섞는 시간도 덮개도 없다 — 곧바로 결과가 있어야 한다
      expect(await screen.findByText('+700P')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '결과 확인' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('한 번만 누르면 된다 — 결과도 알림도 추가 확인 없이 나온다', async () => {
    // 예전에는 결과가 덮개에 가려져 '결과 확인' 을 한 번 더 눌러야 했다.
    // 하루에도 여러 번 누르는 자리라 그 한 단계를 없앴다.
    drawLottery.mockResolvedValue(result());
    const before = fetchPointStatus.mock.calls.length;
    render(<LotteryPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));

    expect(await screen.findByText('+700P', {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('700P 당첨!'));
    // 잔액·내역도 그 자리에서 다시 읽는다
    await waitFor(() => expect(fetchPointStatus.mock.calls.length).toBeGreaterThan(before));
    expect(screen.queryByRole('button', { name: '결과 확인' })).not.toBeInTheDocument();
  });

  it('미당첨을 당첨처럼 그리지 않는다', async () => {
    drawLottery.mockResolvedValue(result({ amount: 0, isBlank: true, balance: 1200 }));
    render(<LotteryPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
    // '+0P' 같은 표기가 나오면 안 된다
    expect(
      await screen.findByText('미당첨', { selector: 'p' }, { timeout: 4000 })
    ).toBeInTheDocument();
    expect(screen.queryByText('+0P')).not.toBeInTheDocument();
  });

  it('횟수를 다 쓰면 버튼을 막는다', async () => {
    fetchPointStatus.mockResolvedValue(status({ drawsLeft: 0, drawsToday: 10 }));
    render(<LotteryPanel />);

    const btn = await screen.findByRole('button', { name: /오늘은 모두 사용했어요/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(drawLottery).not.toHaveBeenCalled();
  });

  it('처음 불러오기가 실패하면 실패했다고 말한다 — 화면을 통째로 비우지 않는다', async () => {
    // 토스트는 곧 사라진다. 그것만 띄우고 return null 하면, 잠시 뒤에는 실패했다는
    // 사실조차 남지 않고 '포인트 기능이 아예 없는 화면' 처럼 보인다.
    // 같은 폴더의 PointRanking·DuelPanel 은 처음부터 이렇게 하고 있었다.
    fetchPointStatus.mockRejectedValue(new Error('네트워크 끊김'));
    render(<LotteryPanel />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
  });

  it('서버가 거절하면 그 이유를 그대로 알린다', async () => {
    // 화면이 자체 문구로 덮으면 "왜 안 되는지" 가 사라진다
    drawLottery.mockRejectedValue({
      response: { data: { message: '오늘은 10번을 모두 사용했습니다. 내일 다시 도전해주세요.' } },
    });
    render(<LotteryPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        '오늘은 10번을 모두 사용했습니다. 내일 다시 도전해주세요.'
      )
    );
  });
});

// 이 판 말고도 같은 화면에서 포인트를 쓰는 곳이 있다(퇴근 공격권). 거기서 쓰고 나면
// 여기 적힌 잔액도 다시 읽어야 한다 — 그러지 않으면 한 화면에 서로 다른 잔액이 둘 뜬다.
describe('바깥에서 포인트를 썼을 때', () => {
  it('신호가 바뀌면 잔액을 다시 읽는다', async () => {
    const { rerender } = render(<LotteryPanel refreshSignal={0} />);
    await screen.findByText('1,200');
    const before = fetchPointStatus.mock.calls.length;

    rerender(<LotteryPanel refreshSignal={1} />);

    await waitFor(() => expect(fetchPointStatus.mock.calls.length).toBeGreaterThan(before));
  });

  it('처음 그릴 때는 한 번만 읽는다 — 신호 0 은 건너뛴다', async () => {
    // 0 을 건너뛰지 않으면 첫 조회와 겹쳐 같은 것을 두 번 부른다.
    // 이 단언이 없으면 그 낭비를 아무도 잡지 못한다 — 화면은 똑같아 보인다.
    render(<LotteryPanel refreshSignal={0} />);
    await screen.findByText('1,200');

    expect(fetchPointStatus).toHaveBeenCalledTimes(1);
  });

  it('같은 신호로 다시 그려도 또 읽지 않는다 — 음성 대조', async () => {
    const { rerender } = render(<LotteryPanel refreshSignal={0} />);
    await screen.findByText('1,200');
    const before = fetchPointStatus.mock.calls.length;

    rerender(<LotteryPanel refreshSignal={0} />);
    await waitFor(() => expect(screen.getByText('1,200')).toBeInTheDocument());

    expect(fetchPointStatus.mock.calls.length).toBe(before);
  });
});

describe('같은 화면의 다른 판에 알린다', () => {
  it('뽑고 나면 잔액이 바뀌었다고 알린다', async () => {
    // 뽑기만 알리지 않아서, 뽑아서 잔액이 줄어도 대결·공격권 판은 옛 잔액으로 버튼을 열어 뒀다
    drawLottery.mockResolvedValue(result());
    const onSpent = vi.fn();
    render(<LotteryPanel onSpent={onSpent} />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
    await waitFor(() => expect(onSpent).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('뽑기에 실패하면 알리지 않는다 — 음성 대조', async () => {
    drawLottery.mockRejectedValue(new Error('한도 초과'));
    const onSpent = vi.fn();
    render(<LotteryPanel onSpent={onSpent} />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
    await waitFor(() => expect(drawLottery).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    expect(onSpent).not.toHaveBeenCalled();
  });
});

describe('여러 번 다시 읽을 때', () => {
  it('늦게 도착한 옛 응답이 새 잔액을 덮지 않는다', async () => {
    // 먼저 떠난 요청이 늦게 도착해 뽑기 전 잔액·남은 횟수로 되돌리면,
    // 남은 횟수가 없는데도 버튼이 열린다
    let resolveOld: (s: PointStatus) => void = () => {};
    fetchPointStatus
      .mockImplementationOnce(() => new Promise<PointStatus>(r => (resolveOld = r)))
      .mockResolvedValueOnce(status({ balance: 3300 }));
    const { rerender } = render(<LotteryPanel refreshSignal={0} />);
    rerender(<LotteryPanel refreshSignal={1} />);

    expect(await screen.findByText('3,300')).toBeInTheDocument();
    resolveOld(status({ balance: 1200 }));
    await new Promise(r => setTimeout(r, 30));
    expect(screen.getByText('3,300')).toBeInTheDocument();
    expect(screen.queryByText('1,200')).not.toBeInTheDocument();
  });
});

describe('다시 읽기 둘이 뒤바뀌어 도착할 때', () => {
  it('나중에 보낸 쪽의 잔액이 남는다', async () => {
    let resolveSlow: (s: PointStatus) => void = () => {};
    fetchPointStatus
      .mockResolvedValueOnce(status()) // 첫 로딩
      .mockImplementationOnce(() => new Promise<PointStatus>(r => (resolveSlow = r))) // 신호 1 — 늦다
      .mockResolvedValueOnce(status({ balance: 3300 })); // 신호 2 — 먼저 온다
    const { rerender } = render(<LotteryPanel refreshSignal={0} />);
    await screen.findByText('1,200');

    rerender(<LotteryPanel refreshSignal={1} />);
    rerender(<LotteryPanel refreshSignal={2} />);
    expect(await screen.findByText('3,300')).toBeInTheDocument();

    resolveSlow(status({ balance: 900 }));
    await new Promise(r => setTimeout(r, 30));
    expect(screen.getByText('3,300')).toBeInTheDocument();
    expect(screen.queryByText('900')).not.toBeInTheDocument();
  });
});
