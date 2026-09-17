// client/src/components/attendance/AttendanceAttack.test.tsx
//
// 공격 알림과 공격 보내기의 화면 규칙을 고정한다.
// 포인트가 드는 버튼이라 "못 사는데 눌리는" 상태가 없어야 한다.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttackBanner, AttackLauncher } from './AttendanceAttack';
import type { AttackState, IncomingAttack } from '../../api/attendance';

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

const state = (over: Partial<AttackState> = {}): AttackState => ({
  rules: { cost: 300, defendCost: 200, blockSeconds: 60, dailyLimit: 5 },
  balance: 1000,
  incoming: null,
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
    expect(screen.getByText(/초 동안 잠깁니다/)).toBeInTheDocument();
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

describe('공격 보내기', () => {
  it('기록은 건드리지 않는다고 분명히 적어 둔다', () => {
    // 이 문구가 사라지면 사람들은 남의 근무 기록이 밀린다고 오해한다
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={() => {}} />);
    expect(screen.getByText(/실제로 누른 순간 그대로/)).toBeInTheDocument();
  });

  it('상대를 고르기 전에는 보낼 수 없다', () => {
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={() => {}} />);
    expect(screen.getByRole('button', { name: /공격/ })).toBeDisabled();
  });

  it('고른 사람에게 보낸다', () => {
    const onAttack = vi.fn();
    render(<AttackLauncher state={state()} myId="me" sending={false} onAttack={onAttack} />);

    fireEvent.click(screen.getByRole('button', { name: '상대 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: /공격/ }));

    expect(onAttack).toHaveBeenCalledWith('victim');
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
