// client/src/components/attendance/AttendanceAttack.test.tsx
//
// 공격을 '받는 쪽' 화면의 규칙을 고정한다 — 경고 띠와 받은 쪽지.
// 보낸 사람이 누구인지는 쪽지에서 절대 빠지면 안 되고,
// 포인트가 드는 방어권은 "못 사는데 눌리는" 상태가 없어야 한다.
//
// 보내는 쪽(공격권 사용)은 포인트 화면으로 옮겼다 — points/AttackPanel.test.tsx.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttackBanner, PopupAlert } from './AttendanceAttack';
import type { IncomingAttack, IncomingPopup } from '../../api/attendance';

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
