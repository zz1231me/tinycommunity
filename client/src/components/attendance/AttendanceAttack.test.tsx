// client/src/components/attendance/AttendanceAttack.test.tsx
//
// 공격 알림·쪽지·공격 보내기의 화면 규칙을 고정한다.
// 포인트가 드는 버튼이라 "못 사는데 눌리는" 상태가 없어야 하고,
// 보낸 사람이 누구인지는 쪽지에서 절대 빠지면 안 된다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttackBanner, AttackLauncher, PopupAlert } from './AttendanceAttack';
import type { AttackState, IncomingAttack, IncomingPopup } from '../../api/attendance';

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

const incoming = (over: Partial<IncomingAttack> = {}): IncomingAttack => ({
  id: 1,
  attackerId: 'bully',
  attackerName: '공격자',
  expiresAt: new Date(Date.now() + 45_000).toISOString(),
  ...over,
});

const popup = (over: Partial<IncomingPopup> = {}): IncomingPopup => ({
  id: 2,
  attackerId: 'bully',
  attackerName: '공격자',
  message: '퇴근 금지',
  ...over,
});

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

beforeEach(() => vi.clearAllMocks());

describe('공격 알림', () => {
  it('누가 걸었는지와 남은 시간을 보여 준다', () => {
    render(
      <AttackBanner
        incoming={incoming()}
        defendCost={200}
        balance={1000}
        defending={false}
        onDefend={() => {}}
        onExpire={() => {}}
      />
    );

    expect(screen.getByText(/공격자/)).toBeInTheDocument();
    expect(screen.getByText(/공격권을 사용했습니다/)).toBeInTheDocument();
    // '잠긴다' 가 아니라 '말을 안 듣는다' 여야 한다 — 실제로 막지 않기 때문이다
    expect(screen.getByText(/말을 안 듣습니다/)).toBeInTheDocument();
  });

  it('방어권을 누르면 그 공격을 방어한다', () => {
    const onDefend = vi.fn();
    render(
      <AttackBanner
        incoming={incoming()}
        defendCost={200}
        balance={1000}
        defending={false}
        onDefend={onDefend}
        onExpire={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /방어권 구매/ }));
    expect(onDefend).toHaveBeenCalledTimes(1);
  });

  it('포인트가 모자라면 방어권을 살 수 없다', () => {
    render(
      <AttackBanner
        incoming={incoming()}
        defendCost={200}
        balance={50}
        defending={false}
        onDefend={() => {}}
        onExpire={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /방어권 구매/ })).toBeDisabled();
  });
});

describe('받은 쪽지', () => {
  it('보낸 사람과 내용을 함께 보여 준다', () => {
    render(<PopupAlert popup={popup()} onClose={() => {}} />);
    // 익명으로 남의 화면에 글을 띄울 수 있으면 장난이 아니라 괴롭힘이 된다
    expect(screen.getByText(/공격자님의 쪽지/)).toBeInTheDocument();
    expect(screen.getByText('퇴근 금지')).toBeInTheDocument();
  });

  it('닫으면 닫았다고 알린다 — 같은 쪽지가 다시 뜨지 않아야 한다', () => {
    const onClose = vi.fn();
    render(<PopupAlert popup={popup()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('공격 보내기', () => {
  it('기록은 건드리지 않는다고 분명히 적어 둔다', () => {
    // 이 문구가 사라지면 사람들은 남의 근무 기록이 밀린다고 오해한다
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={() => {}} />);
    expect(screen.getByText(/실제로 누른 순간 그대로/)).toBeInTheDocument();
  });

  it('상대를 고르기 전에는 보낼 수 없다', () => {
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={() => {}} />);
    expect(screen.getByRole('button', { name: /보내기/ })).toBeDisabled();
  });

  it('기본은 방해 — 고른 사람에게 chaos 로 간다', () => {
    const onAttack = vi.fn();
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={onAttack} />);

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: /보내기/ }));

    expect(onAttack).toHaveBeenCalledWith({ targetId: 'victim', kind: 'chaos' });
  });

  it('쪽지를 고르면 내용 칸이 생기고 그대로 실려 간다', () => {
    const onAttack = vi.fn();
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={onAttack} />);

    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    fireEvent.change(screen.getByLabelText('쪽지 내용'), { target: { value: '야근각' } });
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: /보내기/ }));

    expect(onAttack).toHaveBeenCalledWith({
      targetId: 'victim',
      kind: 'popup',
      message: '야근각',
    });
  });

  it('쪽지 길이는 화면에서도 묶어 둔다', () => {
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    expect(screen.getByLabelText('쪽지 내용')).toHaveAttribute('maxlength', '40');
  });

  it('종류에 따라 값이 다르게 적힌다', () => {
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    expect(screen.getByRole('button', { name: /보내기.*300/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /쪽지/ }));
    expect(screen.getByRole('button', { name: /보내기.*150/ })).toBeInTheDocument();
  });

  it('오늘 다 썼으면 그렇게 말하고 막는다', () => {
    render(
      <AttackLauncher
        state={state({ remainingToday: 0, usedToday: 5 })}
        myId="me"
        sending={false}
        onAttack={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /모두 사용/ })).toBeDisabled();
  });

  it('포인트가 모자라면 그렇게 말하고 막는다', () => {
    render(
      <AttackLauncher
        state={state({ balance: 10 })}
        myId="me"
        sending={false}
        onAttack={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /포인트가 모자랍니다/ })).toBeDisabled();
  });
});
