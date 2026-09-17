// client/src/components/attendance/AttendanceAttack.test.tsx
//
// 공격을 '받는 쪽' 화면의 규칙을 고정한다 — 경고 띠.
// 누가 걸었는지가 빠지면 장난이 아니라 괴롭힘이 되고,
// 포인트가 드는 방어권은 "못 사는데 눌리는" 상태가 없어야 한다.
//
// 보내는 쪽(공격권 사용)은 포인트 화면으로 옮겼다 — points/AttackPanel.test.tsx.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttackBanner } from './AttendanceAttack';
import type { IncomingAttack } from '../../api/attendance';

const incoming = (over: Partial<IncomingAttack> = {}): IncomingAttack => ({
  id: 1,
  attackerId: 'bully',
  attackerName: '공격자',
  kind: 'chaos',
  expiresAt: new Date(Date.now() + 45_000).toISOString(),
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

describe('종류에 따라 다르게 알린다', () => {
  it('숨기기면 보이지 않는다고 적는다', () => {
    // 버튼이 사라진 사람에게 '말을 안 듣습니다' 라고 하면, 고장 난 줄 안다
    render(
      <AttackBanner
        incoming={incoming({ kind: 'hide' })}
        defendCost={200}
        balance={1000}
        defending={false}
        onDefend={() => {}}
        onExpire={() => {}}
      />
    );

    expect(screen.getByText(/보이지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/말을 안 듣습니다/)).not.toBeInTheDocument();
  });
});
