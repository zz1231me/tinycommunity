// client/src/components/points/DuelPanel.test.tsx
//
// 눈으로는 확인하기 어려운 것들을 고정한다: 받은 대결에서 신청자의 손이 보이지 않는지,
// 고른 손이 그대로 서버에 가는지, 실패를 '대결 없음' 으로 그리지 않는지.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DuelPanel } from './DuelPanel';
import type { Duel, DuelBoard } from '../../api/points';

const fetchDuels = vi.hoisted(() => vi.fn());
const createDuel = vi.hoisted(() => vi.fn());
const acceptDuel = vi.hoisted(() => vi.fn());
const declineDuel = vi.hoisted(() => vi.fn());
const cancelDuel = vi.hoisted(() => vi.fn());
vi.mock('../../api/points', () => ({
  fetchDuels,
  createDuel,
  acceptDuel,
  declineDuel,
  cancelDuel,
}));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastInfo = vi.hoisted(() => vi.fn());
vi.mock('../../utils/toast', () => ({
  toast: { success: toastSuccess, error: toastError, info: toastInfo, warning: vi.fn() },
}));

// UserPicker 는 React Query 로 사람을 검색한다. 여기서 보려는 것은 대결 쪽 동작이라
// 사람 고르는 절차는 버튼 하나로 줄인다.
vi.mock('../common/UserPicker', () => ({
  UserPicker: ({
    selected,
    onChange,
  }: {
    selected: Array<{ id: string; name: string }>;
    onChange: (next: Array<{ id: string; name: string }>) => void;
  }) => (
    <button type="button" onClick={() => onChange([{ id: 'bravo', name: '브라보' }])}>
      {selected.length > 0 ? `고름:${selected[0].name}` : '상대 고르기'}
    </button>
  ),
}));

const ME = 'alpha';

const duel = (over: Partial<Duel> = {}): Duel => ({
  id: 1,
  stake: 200,
  status: 'waiting',
  result: null,
  challengerId: 'bravo',
  challengerName: '브라보',
  opponentId: ME,
  opponentName: '알파',
  challengerHand: null,
  opponentHand: null,
  expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
  settledAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const board = (over: Partial<DuelBoard> = {}): DuelBoard => ({
  balance: 1000,
  rules: { minStake: 10, maxStake: 10_000, expireMinutes: 10, maxOpenPerUser: 3 },
  incoming: [],
  outgoing: [],
  recent: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchDuels.mockResolvedValue(board());
});

describe('받은 대결', () => {
  it('누가 얼마를 걸었는지 보여 준다', async () => {
    fetchDuels.mockResolvedValue(board({ incoming: [duel()] }));
    render(<DuelPanel myId={ME} />);

    expect(await screen.findByText('브라보')).toBeInTheDocument();
    expect(screen.getByText('200P')).toBeInTheDocument();
  });

  it('고른 손 그대로 서버에 보낸다', async () => {
    fetchDuels.mockResolvedValue(board({ incoming: [duel({ id: 7 })] }));
    acceptDuel.mockResolvedValue(
      duel({
        id: 7,
        status: 'done',
        result: 'opponent',
        challengerHand: 'rock',
        opponentHand: 'paper',
      })
    );
    render(<DuelPanel myId={ME} />);

    await screen.findByText('브라보');
    // 받은 대결의 버튼은 '보' 가 아니라 무슨 일이 일어나는지까지 읽어 준다
    fireEvent.click(screen.getByRole('button', { name: /보 내고 .*대결 받기/ }));

    await waitFor(() => expect(acceptDuel).toHaveBeenCalledWith(7, 'paper'));
  });

  it('거절하면 그 판만 거절한다', async () => {
    fetchDuels.mockResolvedValue(board({ incoming: [duel({ id: 9 })] }));
    declineDuel.mockResolvedValue(undefined);
    render(<DuelPanel myId={ME} />);

    await screen.findByText('브라보');
    fireEvent.click(screen.getByRole('button', { name: '거절' }));

    await waitFor(() => expect(declineDuel).toHaveBeenCalledWith(9));
  });
});

describe('내가 건 대결', () => {
  it('내 손은 나에게 보인다', async () => {
    fetchDuels.mockResolvedValue(
      board({
        outgoing: [
          duel({
            challengerId: ME,
            challengerName: '알파',
            opponentId: 'bravo',
            opponentName: '브라보',
            challengerHand: 'rock',
          }),
        ],
      })
    );
    render(<DuelPanel myId={ME} />);

    expect(await screen.findByText(/내 손/)).toBeInTheDocument();
  });

  it('거둬들일 수 있다', async () => {
    fetchDuels.mockResolvedValue(
      board({ outgoing: [duel({ id: 4, challengerId: ME, opponentId: 'bravo' })] })
    );
    cancelDuel.mockResolvedValue(undefined);
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: '취소' }));
    await waitFor(() => expect(cancelDuel).toHaveBeenCalledWith(4));
  });
});

describe('최근 결과', () => {
  it('이긴 판과 진 판을 구분해 보여 준다', async () => {
    fetchDuels.mockResolvedValue(
      board({
        recent: [
          // 나는 받은 쪽이므로 result=opponent 가 내 승리다
          duel({
            id: 11,
            status: 'done',
            result: 'opponent',
            challengerHand: 'scissors',
            opponentHand: 'rock',
          }),
          duel({
            id: 12,
            status: 'done',
            result: 'challenger',
            challengerHand: 'rock',
            opponentHand: 'scissors',
          }),
        ],
      })
    );
    render(<DuelPanel myId={ME} />);

    // 정확히 일치로 찾는다 — /승/ 로 두면 안내 문구의 '승부' 까지 걸린다
    expect(await screen.findByText('승')).toBeInTheDocument();
    expect(screen.getByText('패')).toBeInTheDocument();
  });
});

describe('신청', () => {
  it('상대·포인트·손이 모두 정해져야 신청할 수 있다', async () => {
    render(<DuelPanel myId={ME} />);
    const submit = await screen.findByRole('button', { name: /대결 신청/ });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    expect(submit).toBeEnabled();
  });

  it('고른 그대로 신청한다', async () => {
    createDuel.mockResolvedValue(duel());
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: '상대 고르기' }));
    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    fireEvent.click(screen.getByRole('button', { name: /대결 신청/ }));

    await waitFor(() =>
      expect(createDuel).toHaveBeenCalledWith({ opponentId: 'bravo', stake: 300, hand: 'rock' })
    );
  });
});

describe('성공을 실패라고 말하지 않는다', () => {
  it('신청은 됐는데 목록 갱신만 실패하면 오류를 띄우지 않는다', async () => {
    // 동작과 갱신을 같은 try 에 묶어 두면 '신청하지 못했습니다' 가 뜬다.
    // 사용자는 사실과 반대로 알고 다시 걸게 되는데, 판돈은 이미 빠진 뒤다.
    fetchDuels.mockResolvedValueOnce(board());
    createDuel.mockResolvedValue(duel());
    fetchDuels.mockRejectedValueOnce(new Error('네트워크 끊김'));

    render(<DuelPanel myId={ME} />);
    fireEvent.click(await screen.findByRole('button', { name: '상대 고르기' }));
    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    fireEvent.click(screen.getByRole('button', { name: /대결 신청/ }));

    await waitFor(() => expect(createDuel).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });

  it('신청 자체가 실패하면 그때는 알린다', async () => {
    fetchDuels.mockResolvedValue(board());
    createDuel.mockRejectedValue(new Error('포인트가 모자랍니다.'));

    render(<DuelPanel myId={ME} />);
    fireEvent.click(await screen.findByRole('button', { name: '상대 고르기' }));
    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    fireEvent.click(screen.getByRole('button', { name: /대결 신청/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});

describe('실패', () => {
  it('불러오지 못하면 그렇게 말한다 — 대결이 없는 것과 다르다', async () => {
    fetchDuels.mockRejectedValue(new Error('boom'));
    render(<DuelPanel myId={ME} />);

    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
  });
});
