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
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('/ 10')).toBeInTheDocument();
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

  it('덮개를 눌러야 결과가 열린다', async () => {
    drawLottery.mockResolvedValue(result());
    render(<LotteryPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
    const cover = await screen.findByRole('button', { name: '결과 확인' }, { timeout: 4000 });
    expect(toastSuccess).not.toHaveBeenCalled();

    fireEvent.click(cover);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('700P 당첨!'));
  });

  it('미당첨을 당첨처럼 그리지 않는다', async () => {
    drawLottery.mockResolvedValue(result({ amount: 0, isBlank: true, balance: 1200 }));
    render(<LotteryPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /뽑기/ }));
    // '+0P' 같은 표기가 나오면 안 된다
    expect(await screen.findByText('미당첨', { selector: 'p' }, { timeout: 4000 })).toBeInTheDocument();
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
