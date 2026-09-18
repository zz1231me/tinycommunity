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
const tauntDuel = vi.hoisted(() => vi.fn());
vi.mock('../../api/points', () => ({
  fetchDuels,
  createDuel,
  acceptDuel,
  declineDuel,
  cancelDuel,
  tauntDuel,
  DUEL_MESSAGE_MAX: 40,
  DUEL_TAUNT_MAX: 30,
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
  message: null,
  taunt: null,
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

describe('알림에서 넘어온 판', () => {
  it('받은 판으로 가서 강조한다 — 포커스는 손 버튼이 아니라 카드에 둔다', async () => {
    // 손 버튼에 포커스를 두면 Enter 한 번에 포인트가 걸린 승부가 나 버린다
    fetchDuels.mockResolvedValue(board({ incoming: [duel({ id: 7 })] }));
    render(<DuelPanel myId={ME} focusDuelId={7} focusKey="k1" />);

    await waitFor(() => expect(document.getElementById('duel-7')).toHaveClass('animate-duelPulse'));
    // 포커스는 강조를 그린 '다음' 효과에서 옮겨진다. 클래스가 보인 순간 바로 확인하면
    // 빠른 기기에서만 통과한다(CI 에서 실제로 떨어졌다) — 옮겨질 때까지 기다린다.
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('duel-7')));
    expect(acceptDuel).not.toHaveBeenCalled();
  });

  it('목록에 없는 판이면 다시 읽어서 찾는다', async () => {
    // 이미 이 화면에 있을 때 알림을 누르면, 들고 있는 목록은 그 사이에 온 판을 모른다
    fetchDuels
      .mockResolvedValueOnce(board())
      .mockResolvedValueOnce(board({ incoming: [duel({ id: 8 })] }));
    render(<DuelPanel myId={ME} focusDuelId={8} focusKey="k1" />);

    await waitFor(() => expect(document.getElementById('duel-8')).toHaveClass('animate-duelPulse'));
    expect(fetchDuels).toHaveBeenCalledTimes(2);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('끝내 없으면 사라진 판이라고 알려 준다', async () => {
    render(<DuelPanel myId={ME} focusDuelId={99} focusKey="k1" />);

    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith(expect.stringMatching(/사라진 대결/))
    );
  });

  it('같은 알림으로는 한 번만, 새로 누르면 다시 찾아간다', async () => {
    const { rerender } = render(<DuelPanel myId={ME} focusDuelId={99} focusKey="k1" />);
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1));

    rerender(<DuelPanel myId={ME} focusDuelId={99} focusKey="k1" />);
    await new Promise(r => setTimeout(r, 20));
    expect(toastInfo).toHaveBeenCalledTimes(1);

    rerender(<DuelPanel myId={ME} focusDuelId={99} focusKey="k2" />);
    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(2));
  });

  it('끝난 판이면 최근 결과 줄을 강조한다', async () => {
    fetchDuels.mockResolvedValue(
      board({
        recent: [
          duel({
            id: 5,
            status: 'done',
            result: 'opponent',
            challengerHand: 'rock',
            opponentHand: 'paper',
          }),
        ],
      })
    );
    render(<DuelPanel myId={ME} focusDuelId={5} focusKey="k1" />);

    await waitFor(() => expect(document.getElementById('duel-5')).toHaveClass('animate-duelPulse'));
  });
});

describe('신청 메시지', () => {
  it('적은 말을 함께 보낸다', async () => {
    createDuel.mockResolvedValue(duel());
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: '상대 고르기' }));
    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('신청 메시지'), { target: { value: '각오해라' } });
    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    fireEvent.click(screen.getByRole('button', { name: /대결 신청/ }));

    await waitFor(() =>
      expect(createDuel).toHaveBeenCalledWith(expect.objectContaining({ message: '각오해라' }))
    );
  });

  it('비워 두면 말 없이 보낸다', async () => {
    createDuel.mockResolvedValue(duel());
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: '상대 고르기' }));
    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('신청 메시지'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    fireEvent.click(screen.getByRole('button', { name: /대결 신청/ }));

    await waitFor(() => expect(createDuel).toHaveBeenCalled());
    expect(createDuel.mock.calls[0][0].message).toBeUndefined();
  });

  it('받은 도전장에 그 말이 보인다', async () => {
    fetchDuels.mockResolvedValue(board({ incoming: [duel({ message: '각오해라' })] }));
    render(<DuelPanel myId={ME} />);
    expect(await screen.findByText('“각오해라”')).toBeInTheDocument();
  });
});

describe('이긴 판의 한마디', () => {
  // 나는 받은 쪽(opponent)이므로 result=opponent 가 내 승리다
  const won = (over: Partial<Duel> = {}) =>
    duel({
      id: 21,
      status: 'done',
      result: 'opponent',
      challengerHand: 'scissors',
      opponentHand: 'rock',
      ...over,
    });
  const lost = (over: Partial<Duel> = {}) =>
    duel({
      id: 22,
      status: 'done',
      result: 'challenger',
      challengerHand: 'rock',
      opponentHand: 'scissors',
      ...over,
    });

  it('이긴 판에서 한마디를 써서 보낸다', async () => {
    fetchDuels.mockResolvedValue(board({ recent: [won()] }));
    tauntDuel.mockResolvedValue(won({ taunt: '다음에 또 와' }));
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: /한마디 남기기/ }));
    fireEvent.change(screen.getByLabelText('이긴 판에 남길 한마디'), {
      target: { value: '다음에 또 와' },
    });
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(tauntDuel).toHaveBeenCalledWith(21, '다음에 또 와'));
  });

  it('진 판에는 한마디 버튼이 없다 — 음성 대조', async () => {
    fetchDuels.mockResolvedValue(board({ recent: [lost()] }));
    render(<DuelPanel myId={ME} />);
    await screen.findByText('패');
    expect(screen.queryByRole('button', { name: /한마디 남기기/ })).not.toBeInTheDocument();
  });

  it('이미 남긴 판에는 다시 남길 수 없다', async () => {
    fetchDuels.mockResolvedValue(board({ recent: [won({ taunt: '벌써 씀' })] }));
    render(<DuelPanel myId={ME} />);
    expect(await screen.findByText(/벌써 씀/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /한마디 남기기/ })).not.toBeInTheDocument();
  });

  it('진 쪽은 이긴 사람이 남긴 말을 누가 했는지와 함께 본다', async () => {
    fetchDuels.mockResolvedValue(board({ recent: [lost({ taunt: '약하네' })] }));
    render(<DuelPanel myId={ME} />);
    expect(await screen.findByText('💬 브라보: “약하네”')).toBeInTheDocument();
  });

  it('받은 대결에서 이기면 한마디 칸이 바로 열린다', async () => {
    fetchDuels
      .mockResolvedValueOnce(board({ incoming: [duel({ id: 21 })] }))
      .mockResolvedValue(board({ recent: [won()] }));
    acceptDuel.mockResolvedValue(won());
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: /바위 내고 .*대결 받기/ }));
    expect(await screen.findByLabelText('이긴 판에 남길 한마디')).toBeInTheDocument();
  });
});

describe('여러 번 다시 읽을 때', () => {
  it('늦게 도착한 옛 응답이 새 목록을 덮지 않는다', async () => {
    // 받기 전에 떠난 요청이 받은 뒤에 도착해, 이미 끝난 판을 '받은 대결' 로 되살렸다
    let resolveOld: (b: DuelBoard) => void = () => {};
    fetchDuels
      .mockImplementationOnce(() => new Promise<DuelBoard>(r => (resolveOld = r))) // 첫 조회 — 늦게 온다
      .mockResolvedValueOnce(board({ recent: [duel({ id: 3, status: 'done', result: 'draw' })] }));
    const { rerender } = render(<DuelPanel myId={ME} refreshSignal={0} />);
    rerender(<DuelPanel myId={ME} refreshSignal={1} />); // 새 조회 — 먼저 온다

    await waitFor(() => expect(fetchDuels).toHaveBeenCalledTimes(2));
    // 옛 응답: 아직 기다리는 판이 있다고 말한다
    resolveOld(board({ incoming: [duel({ id: 3 })] }));
    await new Promise(r => setTimeout(r, 30));

    expect(screen.queryByRole('button', { name: /대결 받기/ })).not.toBeInTheDocument();
  });
});

describe('알림에서 넘어온 판 — 한 번만', () => {
  it('찾아간 뒤 부모에게 알린다 — 주소에서 지우게', async () => {
    fetchDuels.mockResolvedValue(board({ incoming: [duel({ id: 7 })] }));
    const onFocusHandled = vi.fn();
    render(<DuelPanel myId={ME} focusDuelId={7} focusKey="k1" onFocusHandled={onFocusHandled} />);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
  });

  it('못 찾았어도 알린다 — 다시 그려질 때마다 사라진 판이라고 하지 않게', async () => {
    const onFocusHandled = vi.fn();
    render(<DuelPanel myId={ME} focusDuelId={99} focusKey="k1" onFocusHandled={onFocusHandled} />);
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
  });
});

describe('잔액 신호', () => {
  it('신청이 되면 같은 화면의 다른 판에 알린다', async () => {
    createDuel.mockResolvedValue(duel());
    const onSpent = vi.fn();
    render(<DuelPanel myId={ME} onSpent={onSpent} />);

    fireEvent.click(await screen.findByRole('button', { name: '상대 고르기' }));
    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    fireEvent.click(screen.getByRole('button', { name: /대결 신청/ }));

    await waitFor(() => expect(onSpent).toHaveBeenCalledTimes(1));
  });

  it('신청이 거절되면 알리지 않는다 — 음성 대조', async () => {
    createDuel.mockRejectedValue(new Error('포인트가 모자랍니다.'));
    const onSpent = vi.fn();
    render(<DuelPanel myId={ME} onSpent={onSpent} />);

    fireEvent.click(await screen.findByRole('button', { name: '상대 고르기' }));
    fireEvent.change(screen.getByLabelText('걸 포인트'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '바위' }));
    fireEvent.click(screen.getByRole('button', { name: /대결 신청/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onSpent).not.toHaveBeenCalled();
  });

  it('다른 판이 포인트를 쓰면 다시 읽는다', async () => {
    const { rerender } = render(<DuelPanel myId={ME} refreshSignal={0} />);
    await screen.findByRole('button', { name: /대결 신청/ });
    const before = fetchDuels.mock.calls.length;
    rerender(<DuelPanel myId={ME} refreshSignal={1} />);
    await waitFor(() => expect(fetchDuels.mock.calls.length).toBe(before + 1));
  });
});

describe('오류와 회복', () => {
  it('첫 로딩이 실패해도 나중에 읽히면 오류 화면에서 벗어난다', async () => {
    fetchDuels.mockRejectedValueOnce(new Error('잠깐 끊김')).mockResolvedValue(board());
    const { rerender } = render(<DuelPanel myId={ME} refreshSignal={0} />);
    expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();

    rerender(<DuelPanel myId={ME} refreshSignal={1} />);
    expect(await screen.findByRole('button', { name: /대결 신청/ })).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();
  });

  it('못 읽은 것을 사라진 대결이라고 하지 않는다', async () => {
    // 그렇게 말하면 살아 있는 도전장을 사람이 찾지 않게 된다
    fetchDuels.mockResolvedValueOnce(board()).mockRejectedValueOnce(new Error('끊김'));
    render(<DuelPanel myId={ME} focusDuelId={7} focusKey="k1" />);

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/불러오지 못했습니다/))
    );
    expect(toastInfo).not.toHaveBeenCalledWith(expect.stringMatching(/사라진 대결/));
  });
});

describe('포커스', () => {
  const won = duel({
    id: 21,
    status: 'done',
    result: 'opponent',
    challengerHand: 'scissors',
    opponentHand: 'rock',
  });

  it('받은 대결에 답하면 그 판(최근 결과 줄)으로 포커스가 간다 — 맨 위로 떨어지지 않는다', async () => {
    fetchDuels
      .mockResolvedValueOnce(board({ incoming: [duel({ id: 21 })] }))
      .mockResolvedValue(board({ recent: [won] }));
    acceptDuel.mockResolvedValue(won);
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: /바위 내고 .*대결 받기/ }));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('duel-21')));
  });

  it('한마디 남기기를 누르면 그 칸으로 커서가 간다 — 대조', async () => {
    fetchDuels.mockResolvedValue(board({ recent: [won] }));
    render(<DuelPanel myId={ME} />);

    fireEvent.click(await screen.findByRole('button', { name: /한마디 남기기/ }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('이긴 판에 남길 한마디'))
    );
  });

  it('강조 중에 같은 알림을 다시 누르면 다시 찾아간다', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    fetchDuels.mockResolvedValue(board({ incoming: [duel({ id: 7 })] }));
    const { rerender } = render(<DuelPanel myId={ME} focusDuelId={7} focusKey="k1" />);
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));

    rerender(<DuelPanel myId={ME} focusDuelId={7} focusKey="k2" />);
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
  });
});

describe('한마디 칸이 늦게 떠도', () => {
  it('다른 칸에 쓰던 커서를 빼앗지 않는다', async () => {
    // 이긴 직후 목록 갱신이 한 박자 늦으면, 한마디 칸은 나중에(주기·알림·다른 판의 신호로)
    // 뜬다. 그때 사람은 이미 다른 칸에 쓰고 있을 수 있다.
    const won = duel({
      id: 21,
      status: 'done',
      result: 'opponent',
      challengerHand: 'scissors',
      opponentHand: 'rock',
    });
    fetchDuels
      .mockResolvedValueOnce(board({ incoming: [duel({ id: 21 })] }))
      .mockResolvedValueOnce(board()) // 이긴 직후 — 아직 최근 결과에 없다
      .mockResolvedValue(board({ recent: [won] }));
    acceptDuel.mockResolvedValue(won);
    const { rerender } = render(<DuelPanel myId={ME} refreshSignal={0} />);

    fireEvent.click(await screen.findByRole('button', { name: /바위 내고 .*대결 받기/ }));
    await waitFor(() => expect(acceptDuel).toHaveBeenCalled());
    const stake = screen.getByLabelText('걸 포인트');
    stake.focus();

    rerender(<DuelPanel myId={ME} refreshSignal={1} />);
    await screen.findByLabelText('이긴 판에 남길 한마디');
    await new Promise(r => setTimeout(r, 30));
    expect(document.activeElement).toBe(stake);
  });
});
