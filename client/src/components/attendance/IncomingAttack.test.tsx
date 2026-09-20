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
  startsAt: new Date().toISOString(),
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
    queue: [incoming()],
    usedToday: 0,
    remainingToday: 5,
    ...over,
  });

  it('걸린 공격이 없으면 아무것도 그리지 않는다', async () => {
    fetchAttackState.mockResolvedValue(state({ incoming: null, queue: [] }));
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
    const { queryClient } = renderWithQuery(<IncomingAttackCard />);

    fireEvent.click(await screen.findByRole('button', { name: /방어권 구매/ }));

    expect(await screen.findByText(/방어 성공/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /방어권/ })).not.toBeInTheDocument();
    // 같은 캐시를 쓰는 출근 화면의 퇴근 버튼 효과도 이 순간 풀린다
    expect(
      queryClient.getQueryData<{ incoming: unknown; balance: number }>(attendanceKeys.attack)
    ).toMatchObject({
      incoming: null,
      balance: 800,
    });
  });
});

describe('쌓인 공격 — 포인트 탭', () => {
  const at = (s: number) => new Date(Date.now() + s * 1000).toISOString();
  const stacked = () => {
    const q = [
      incoming({ id: 1, startsAt: at(-5), expiresAt: at(55) }),
      incoming({ id: 2, attackerName: '이영희', startsAt: at(55), expiresAt: at(115) }),
      incoming({ id: 3, attackerName: '박민수', startsAt: at(115), expiresAt: at(175) }),
    ];
    return {
      rules: {
        cost: 300,
        hideCost: 300,
        defendCost: 200,
        blockSeconds: 60,
        hideSeconds: 20,
        dailyLimit: 5,
        maxStack: 10,
      },
      balance: 1000,
      incoming: q[0],
      queue: q,
      usedToday: 0,
      remainingToday: 5,
    };
  };

  it('뒤에 몇 개가 기다리는지와 전부 풀리기까지를 알린다', async () => {
    fetchAttackState.mockResolvedValue(stacked());
    renderWithQuery(<IncomingAttackCard />);
    expect(await screen.findByText(/뒤에 2개 더 대기/)).toBeInTheDocument();
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('방어하면 맨 앞만 풀리고, 다음 공격이 곧바로 앞으로 당겨진다', async () => {
    fetchAttackState.mockResolvedValueOnce(stacked());
    fetchAttackState.mockImplementation(() => new Promise(() => {})); // 다시 읽기는 느리다
    sendDefend.mockResolvedValue({ id: 1, remaining: 2 });
    const { queryClient } = renderWithQuery(<IncomingAttackCard />);

    fireEvent.click(await screen.findByRole('button', { name: /방어권 구매/ }));

    expect(await screen.findByText(/남은 공격 2개가 이어집니다/)).toBeInTheDocument();
    const cached = queryClient.getQueryData<{
      incoming: { id: number; startsAt: string; expiresAt: string };
      queue: unknown[];
    }>(attendanceKeys.attack)!;
    expect(cached.queue).toHaveLength(2);
    expect(cached.incoming.id).toBe(2);
    // 원래는 55초 뒤에 시작할 공격이 지금 시작한다 — 길이(60초)는 그대로
    const start = new Date(cached.incoming.startsAt).getTime();
    expect(Math.abs(start - Date.now())).toBeLessThan(2000);
    expect(new Date(cached.incoming.expiresAt).getTime() - start).toBe(60_000);
    // 다음 공격의 경고 띠가 바로 뜬다
    expect(await screen.findByText(/이영희/)).toBeInTheDocument();
  });

  describe('내 시계가 어긋나 있어도', () => {
    // 자기 시계만 믿던 때는, 몇 분 빠른 PC 에서 걸려 있는 공격이 '이미 끝난 것' 으로 보여
    // 경고 띠도 방어 버튼도 뜨지 않았다 — 공격자의 포인트만 사라지고 받는 쪽은 멀쩡했다.
    const payload = (expiresAt: string, serverNow: string) => ({
      now: serverNow,
      rules: {
        cost: 300,
        hideCost: 300,
        defendCost: 200,
        blockSeconds: 60,
        hideSeconds: 20,
        dailyLimit: 5,
        maxStack: 10,
      },
      balance: 1000,
      incoming: incoming({ expiresAt }),
      queue: [incoming({ expiresAt })],
      usedToday: 0,
      remainingToday: 5,
    });

    it('시계가 2분 빨라도 공격이 보인다 — 서버 시각으로 센다', async () => {
      const expiresAt = new Date(Date.now() - 60_000).toISOString(); // 내 시계로는 이미 끝났다
      const serverNow = new Date(Date.now() - 120_000).toISOString(); // 서버는 2분 뒤처져 있다

      fetchAttackState.mockResolvedValue(payload(expiresAt, serverNow));
      renderWithQuery(<IncomingAttackCard />);

      // 서버 기준으로는 아직 1분 남았다
      expect(await screen.findByText(/공격권을 사용했습니다/)).toBeInTheDocument();
    });

    it('서버 기준으로 끝난 공격은 띠를 띄우지 않는다 — 대조', async () => {
      const expiresAt = new Date(Date.now() + 40_000).toISOString(); // 내 시계로는 남아 있다
      const serverNow = new Date(Date.now() + 120_000).toISOString(); // 서버는 2분 앞서 있다

      fetchAttackState.mockResolvedValue(payload(expiresAt, serverNow));
      const { container } = renderWithQuery(<IncomingAttackCard />);

      await waitFor(() => expect(fetchAttackState).toHaveBeenCalled());
      expect(container).toBeEmptyDOMElement();
    });
  });
});
