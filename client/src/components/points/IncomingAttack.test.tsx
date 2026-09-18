// client/src/components/attendance/AttendanceAttack.test.tsx
//
// 공격을 '받는 쪽' 화면의 규칙을 고정한다 — 경고 띠.
// 누가 걸었는지가 빠지면 장난이 아니라 괴롭힘이 되고,
// 포인트가 드는 방어권은 "못 사는데 눌리는" 상태가 없어야 한다.
//
// 보내는 쪽(공격권 사용)은 포인트 화면으로 옮겼다 — points/AttackPanel.test.tsx.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../test/renderWithQuery';
import { attendanceKeys } from '../../api/queryKeys';
import {
  AttackBanner,
  DefendedBanner,
  IncomingAttack as IncomingAttackCard,
} from './IncomingAttack';

const fetchAttackState = vi.hoisted(() => vi.fn());
const sendDefend = vi.hoisted(() => vi.fn());
vi.mock('../../api/attendance', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/attendance')>()),
  fetchAttackState,
  sendDefend,
}));
vi.mock('../../utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
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

    expect(screen.getByRole('button', { name: /방어권/ })).toBeDisabled();
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

describe('남은 시간 막대', () => {
  const banner = (over: { totalSeconds?: number } = {}) =>
    render(
      <AttackBanner
        incoming={incoming()}
        {...over}
        defendCost={200}
        balance={1000}
        defending={false}
        onDefend={() => {}}
        onExpire={() => {}}
      />
    );

  it('원래 길이에 대해 남은 만큼만 차 있다', () => {
    // 60초짜리 공격이 45초 남았다 → 75%
    banner({ totalSeconds: 60 });
    const bar = screen.getByRole('progressbar', { name: /남은 시간/ });
    expect(bar).toHaveAttribute('aria-valuemax', '60');
    expect(bar).toHaveAttribute('aria-valuenow', '45');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('75%');
  });

  it('원래 길이를 모르면 처음 남아 있던 시간을 가득 찬 것으로 본다', () => {
    banner();
    const bar = screen.getByRole('progressbar', { name: /남은 시간/ });
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%');
  });
});

describe('방어권 버튼의 빛', () => {
  const glow = () => screen.getByRole('button', { name: /방어권/ }).className;

  it('살 수 있을 때만 빛난다', () => {
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
    expect(glow()).toContain('animate-shieldGlow');
  });

  it('못 사는 버튼은 눌러 달라고 빛나지 않는다 — 음성 대조', () => {
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
    expect(glow()).not.toContain('animate-shieldGlow');
  });
});

describe('방어 성공', () => {
  it('누구의 공격을 막았는지 알려 준다', () => {
    render(<DefendedBanner attackerName="공격자" />);
    expect(screen.getByRole('status')).toHaveTextContent(/방어 성공/);
    expect(screen.getByRole('status')).toHaveTextContent(/공격자님의 공격을 막았습니다/);
  });
});

describe('휴대폰에서도 읽히는 안내', () => {
  it('못 사는 이유를 툴팁이 아니라 버튼 글자로 보여 준다', () => {
    // 툴팁(title)은 휴대폰에서 볼 방법이 없다
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
    expect(screen.getByRole('button', { name: /방어권/ })).toHaveTextContent(/보유 50P 부족/);
  });

  it('살 수 있으면 부족하다고 하지 않는다 — 음성 대조', () => {
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
    expect(screen.getByRole('button', { name: /방어권/ })).not.toHaveTextContent(/부족/);
  });

  it('시간이 다 되면 "0초 동안" 이 아니라 곧 풀린다고 한다', () => {
    render(
      <AttackBanner
        incoming={incoming({ expiresAt: new Date(Date.now() - 1000).toISOString() })}
        defendCost={200}
        balance={1000}
        defending={false}
        onDefend={() => {}}
        onExpire={() => {}}
      />
    );
    expect(screen.getByText(/곧 풀립니다/)).toBeInTheDocument();
    expect(screen.queryByText(/0초 동안/)).not.toBeInTheDocument();
  });
});

describe('포인트 탭 맨 위의 받은 공격', () => {
  const state = (over: Record<string, unknown> = {}) => ({
    rules: {
      cost: 300,
      hideCost: 300,
      defendCost: 200,
      blockSeconds: 60,
      hideSeconds: 20,
      dailyLimit: 5,
    },
    balance: 1000,
    incoming: incoming(),
    usedToday: 0,
    remainingToday: 5,
    ...over,
  });

  it('걸린 공격이 없으면 아무것도 그리지 않는다', async () => {
    fetchAttackState.mockResolvedValue(state({ incoming: null }));
    const { container } = renderWithQuery(<IncomingAttackCard />);
    await waitFor(() => expect(fetchAttackState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('방어하면 경고 띠가 곧바로 사라지고 방어 성공이 뜬다 — 다시 누를 틈이 없다', async () => {
    // 다시 읽어 오기를 기다리는 동안 살아 있는 방어 버튼이 남아, 한 번 더 누르면
    // '이미 방어했습니다' 가 방어 성공 옆에 떴다
    fetchAttackState.mockResolvedValueOnce(state());
    // 다시 읽기는 느리게 온다 — 그 전에 이미 사라져 있어야 한다
    fetchAttackState.mockImplementation(() => new Promise(() => {}));
    sendDefend.mockResolvedValue({ id: 1 });
    const onSpent = vi.fn();
    const { queryClient } = renderWithQuery(<IncomingAttackCard onSpent={onSpent} />);

    fireEvent.click(await screen.findByRole('button', { name: /방어권 구매/ }));

    expect(await screen.findByText(/방어 성공/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /방어권/ })).not.toBeInTheDocument();
    expect(onSpent).toHaveBeenCalledTimes(1);
    // 같은 캐시를 쓰는 출근 화면의 퇴근 버튼 효과도 이 순간 풀린다
    expect(
      queryClient.getQueryData<{ incoming: unknown; balance: number }>(attendanceKeys.attack)
    ).toMatchObject({
      incoming: null,
      balance: 800,
    });
  });
});
