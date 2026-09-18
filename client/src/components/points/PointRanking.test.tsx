// client/src/components/points/PointRanking.test.tsx
// 순위표가 "아무도 없는 것" 과 "못 불러온 것" 을 구분하는가, 그리고 내 자리를 보여 주는가.
//
// 조회가 실패해도 목록은 비어 있다. 그대로 두면 '아직 순위가 없습니다' 가 떠서
// 순위표가 텅 빈 것으로 오해한다 — 이 저장소에서 이미 몇 번 나온 유형이다.
//
// 상위권 밖에 있는 사람에게는 내 자리가 따로 붙어야 한다. 그게 없으면 대부분의
// 사람에게 순위표는 남의 이야기가 된다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PointRanking } from './PointRanking';
import type { PointRanking as Ranking } from '../../api/points';

const mockFetchRanking = vi.fn();
vi.mock('../../api/points', () => ({
  fetchPointRanking: () => mockFetchRanking(),
}));

const entry = (rank: number, userId: string, name: string, balance: number) => ({
  rank,
  userId,
  name,
  balance,
});

const data = (over: Partial<Ranking> = {}): Ranking => ({
  top: [entry(1, 'alice', '앨리스', 900), entry(2, 'bobby', '바비', 500)],
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
