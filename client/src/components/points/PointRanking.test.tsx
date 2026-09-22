// client/src/components/points/PointRanking.test.tsx
// 순위표가 "아무도 없는 것" 과 "못 불러온 것" 을 구분하는가, 그리고 내 자리를 보여 주는가.
//
// 조회가 실패해도 목록은 비어 있다. 그대로 두면 '아직 순위가 없습니다' 가 떠서
// 순위표가 텅 빈 것으로 오해한다 — 이 저장소에서 이미 몇 번 나온 유형이다.
//
// 상위권 밖에 있는 사람에게는 내 자리가 따로 붙어야 한다. 그게 없으면 대부분의
// 사람에게 순위표는 남의 이야기가 된다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { PointRanking } from './PointRanking';
import type { PointRanking as Ranking } from '../../api/points';

const mockFetchRanking = vi.fn();
vi.mock('../../api/points', () => ({
  fetchPointRanking: () => mockFetchRanking(),
}));

const entry = (rank: number, userId: string, name: string, balance: number | null) => ({
  rank,
  userId,
  name,
  balance,
});

const data = (over: Partial<Ranking> = {}): Ranking => ({
  top: [entry(1, 'alice', '앨리스', 900), entry(2, 'bobby', '바비', null)],
  me: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('못 불러온 것과 아무도 없는 것', () => {
  it('조회가 실패하면 실패했다고 말한다', async () => {
    mockFetchRanking.mockRejectedValue(new Error('끊김'));

    render(<PointRanking />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 순위가 없습니다/)).not.toBeInTheDocument();
  });

  it('정말 아무도 없을 때만 없다고 말한다', async () => {
    mockFetchRanking.mockResolvedValue(data({ top: [] }));

    render(<PointRanking />);

    expect(await screen.findByText(/아직 순위가 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
  });
});

describe('보여주는 것', () => {
  it('받은 순서 그대로 등수와 함께 그린다', async () => {
    mockFetchRanking.mockResolvedValue(data());

    render(<PointRanking />);

    expect(await screen.findByText('앨리스')).toBeInTheDocument();
    expect(screen.getByText('바비')).toBeInTheDocument();
    expect(screen.getByText('900')).toBeInTheDocument();
  });

  it('상위 목록 밖이면 내 자리를 따로 붙인다', async () => {
    mockFetchRanking.mockResolvedValue(data({ me: entry(42, 'me', '나야', 3) }));

    render(<PointRanking />);

    expect(await screen.findByText('나야')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('내가 상위 목록 안에 있으면 아래에 또 붙이지 않는다', async () => {
    const mine = entry(2, 'bobby', '바비', 500);
    mockFetchRanking.mockResolvedValue(data({ me: mine }));

    render(<PointRanking />);

    await screen.findByText('앨리스');
    // 같은 사람이 두 줄로 나오면 등수가 두 번 세어진 것처럼 보인다
    expect(screen.getAllByText('바비')).toHaveLength(1);
  });
});

describe('프로필 사진', () => {
  it('사진이 있는 사람은 그 사진을 보여 준다', async () => {
    mockFetchRanking.mockResolvedValue(
      data({
        top: [
          { ...entry(1, 'alice', '앨리스', 900), avatar: '/uploads/avatars/alice.png' },
          { ...entry(2, 'bobby', '바비', 500), avatar: null },
        ],
      })
    );
    render(<PointRanking />);

    const img = await screen.findByAltText('앨리스님의 프로필');
    expect(img.getAttribute('src')).toContain('alice.png');
  });

  it('사진이 없으면 사진 대신 다른 표시를 쓴다 — 깨진 그림을 띄우지 않는다', async () => {
    mockFetchRanking.mockResolvedValue(data());
    render(<PointRanking />);

    await screen.findByText('앨리스');
    expect(screen.queryByAltText('앨리스님의 프로필')).not.toBeInTheDocument();
  });
});

describe('1~3등 시상대', () => {
  const five = () =>
    data({
      top: [
        entry(1, 'alice', '앨리스', 900),
        entry(2, 'bobby', '바비', 500),
        entry(3, 'carol', '캐럴', 300),
        entry(4, 'dave', '데이브', 200),
        entry(5, 'erin', '에린', 100),
      ],
    });

  it('1~3등만 시상대에 서고, 4등부터는 아래 목록이다', async () => {
    mockFetchRanking.mockResolvedValue(five());
    render(<PointRanking />);

    const podium = await screen.findByTestId('podium');
    const onPodium = within(podium);
    expect(onPodium.getByText('앨리스')).toBeInTheDocument();
    expect(onPodium.getByText('바비')).toBeInTheDocument();
    expect(onPodium.getByText('캐럴')).toBeInTheDocument();
    expect(onPodium.queryByText('데이브')).not.toBeInTheDocument();
    expect(screen.getByText('데이브')).toBeInTheDocument();
    expect(screen.getByText('에린')).toBeInTheDocument();
  });

  it('화면에는 2·1·3 으로 놓되 읽는 순서는 1·2·3 이다', async () => {
    mockFetchRanking.mockResolvedValue(five());
    render(<PointRanking />);

    const items = within(await screen.findByTestId('podium')).getAllByRole('listitem');
    expect(items.map(li => li.textContent)).toEqual([
      expect.stringContaining('앨리스'),
      expect.stringContaining('바비'),
      expect.stringContaining('캐럴'),
    ]);
    expect(items.map(li => li.className.match(/order-\d/)?.[0])).toEqual([
      'order-2',
      'order-1',
      'order-3',
    ]);
  });

  it('공동 1등은 둘 다 금색이다 — 자리가 아니라 등수로 칠한다', async () => {
    mockFetchRanking.mockResolvedValue(
      data({ top: [entry(1, 'alice', '앨리스', 900), entry(1, 'bobby', '바비', 900)] })
    );
    render(<PointRanking />);

    const items = within(await screen.findByTestId('podium')).getAllByRole('listitem');
    const badge = (li: HTMLElement) => within(li).getByText('1').className;
    expect(badge(items[0])).toContain('from-yellow-400');
    expect(badge(items[1])).toContain('from-yellow-400');
  });

  it('시상대에 선 사람이 나면 표시한다', async () => {
    mockFetchRanking.mockResolvedValue(data({ me: entry(2, 'bobby', '바비', 500) }));
    render(<PointRanking />);

    const items = within(await screen.findByTestId('podium')).getAllByRole('listitem');
    expect(within(items[1]).getByText('나')).toBeInTheDocument();
    expect(within(items[0]).queryByText('나')).not.toBeInTheDocument();
  });
});

describe('다른 판에서 포인트가 움직이면', () => {
  // 이것이 없어서 뽑기·대결로 잔액이 바뀌어도 바로 아래 순위표만 옛 잔액을 보여 주었다
  it('순위를 다시 읽는다', async () => {
    mockFetchRanking.mockResolvedValue(data({ me: entry(42, 'me', '나야', 3) }));
    const { rerender } = render(<PointRanking refreshSignal={0} />);
    expect(await screen.findByText('나야')).toBeInTheDocument();
    mockFetchRanking.mockClear();

    rerender(<PointRanking refreshSignal={1} />);

    await waitFor(() => expect(mockFetchRanking).toHaveBeenCalled());
  });

  it('같은 신호에는 다시 읽지 않는다 — 대조', async () => {
    mockFetchRanking.mockResolvedValue(data());
    const { rerender } = render(<PointRanking refreshSignal={3} />);
    expect(await screen.findByText('앨리스')).toBeInTheDocument();
    mockFetchRanking.mockClear();

    rerender(<PointRanking refreshSignal={3} />);

    expect(mockFetchRanking).not.toHaveBeenCalled();
  });
});

describe('점수는 1등과 내 것만', () => {
  it('1등 점수는 보여 준다', async () => {
    mockFetchRanking.mockResolvedValue(data());
    render(<PointRanking />);
    expect(await screen.findByText('900')).toBeInTheDocument();
  });

  it('점수가 오지 않은 사람 자리에는 아무 숫자도 적지 않는다', async () => {
    // 0 으로 떨어뜨려 '0P' 를 적으면 빈털터리라고 잘못 알리는 셈이다
    mockFetchRanking.mockResolvedValue(data());
    render(<PointRanking />);

    const podium = await screen.findByTestId('podium');
    const [firstBalance, secondBalance] = within(podium).getAllByTestId('podium-balance');
    // 1등 자리는 채워지고 2등 자리는 비어 있어야 한다 — 둘을 함께 재야 판별력이 있다.
    expect(firstBalance).toHaveTextContent('900');
    expect(secondBalance.textContent).toBe('');
  });

  it('상위권 밖이어도 내 점수는 보인다', async () => {
    mockFetchRanking.mockResolvedValue(
      data({ me: { rank: 7, userId: 'me', name: '나', balance: 120 } })
    );
    render(<PointRanking />);
    expect(await screen.findByText('120')).toBeInTheDocument();
  });
});

describe('1등 이름', () => {
  it('금빛 표시가 붙는다 — 누가 1등인지 이름만 봐도 안다', async () => {
    mockFetchRanking.mockResolvedValue(data());
    render(<PointRanking />);

    const first = await screen.findByText('앨리스');
    expect(first).toHaveClass('champion-name');
  });

  it('2등부터는 붙지 않는다', async () => {
    mockFetchRanking.mockResolvedValue(data());
    render(<PointRanking />);

    const second = await screen.findByText('바비');
    expect(second).not.toHaveClass('champion-name');
  });
});
