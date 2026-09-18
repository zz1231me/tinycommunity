// client/src/components/attendance/TodayHero.test.tsx
//
// 퇴근 버튼이 공격 종류에 따라 어떻게 달라지는가.
//
// 이 기능에는 지켜야 할 선이 있다 — 방해(chaos)는 성가시게 할 뿐 끝내 누를 수 있어야
// 하고, 숨기기(hide)는 그 짧은 동안 정말로 누를 수 없어야 한다. 둘이 뒤바뀌면
// 한쪽은 재미가 없고 다른 쪽은 남의 퇴근을 막는 기능이 된다.
//
// 그래서 '보이는가' 가 아니라 '누를 수 있는가' 로 건다. 역할(role)로 찾으면
// aria-hidden 은 걸러지므로, 안 보이게만 해 둔 버튼은 여기서 걸린다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TodayHero } from './TodayHero';
import type { AttackKind } from '../../api/attendance';

// 크기·난수를 가짜로 바꾸는 테스트가 있다. 그 테스트가 중간에 실패해도 가짜가 뒤 테스트로
// 새지 않게 매번 되돌린다(새면 실패 하나가 엉뚱한 테스트들의 실패로 번진다).
afterEach(() => vi.restoreAllMocks());

const show = (attackKind: AttackKind | null) =>
  render(
    <TodayHero
      workDate="2026-09-18"
      record={null}
      standardWorkMinutes={480}
      canCheckIn
      canCheckOut
      checkingOut={false}
      attackKind={attackKind}
      onCheckIn={vi.fn()}
      onCheckOut={vi.fn()}
    />
  );

const checkOutButton = () => screen.queryByRole('button', { name: '퇴근' });

describe('숨기기 공격을 받는 동안', () => {
  it('퇴근 버튼을 누를 수 없다', () => {
    show('hide');
    expect(checkOutButton()).toBeNull();
  });

  it('그래도 자리는 남는다', () => {
    // 버튼이 빠지면서 줄이 줄어들면 옆의 출근 버튼까지 움직인다.
    // 누를 수는 없지만 자리를 지키는 것이 남아 있어야 한다.
    show('hide');
    // 글자로 찾지 않는다 — 숨기는 동안에는 가짜 퇴근 버튼들도 '퇴근' 이라고 적혀 있다
    expect(screen.getByTestId('checkout-slot')).toHaveTextContent('퇴근');
  });

  it('출근 버튼은 그대로다', () => {
    // 숨기는 것은 퇴근 버튼뿐이다
    show('hide');
    expect(screen.getByRole('button', { name: '출근' })).toBeInTheDocument();
  });
});

describe('그 밖의 경우에는 퇴근 버튼이 살아 있다', () => {
  it('방해를 받는 중에도 누를 수 있다 — 양성 대조', () => {
    // 이것이 없으면 '언제나 버튼을 안 그리는' 구현도 위 테스트를 통과한다.
    // 방해는 성가시게 할 뿐 막지 않는다는 것이 이 기능의 전제다.
    show('chaos');
    expect(checkOutButton()).toBeInTheDocument();
    expect(checkOutButton()).toBeEnabled();
  });

  it('공격이 없으면 당연히 누를 수 있다', () => {
    show(null);
    expect(checkOutButton()).toBeInTheDocument();
    expect(checkOutButton()).toBeEnabled();
  });
});

describe('숨겼던 버튼이 돌아올 때', () => {
  const hero = (attackKind: AttackKind | null) => (
    <TodayHero
      workDate="2026-09-18"
      record={null}
      standardWorkMinutes={480}
      canCheckIn
      canCheckOut
      checkingOut={false}
      attackKind={attackKind}
      onCheckIn={vi.fn()}
      onCheckOut={vi.fn()}
    />
  );
  const popped = () => checkOutButton()?.closest('.animate-popIn') ?? null;

  it('숨기기가 풀리면 톡 튀어나온다', () => {
    const { rerender } = render(hero('hide'));
    rerender(hero(null));
    expect(popped()).not.toBeNull();
  });

  it('처음 그릴 때와 방해가 풀릴 때는 움직이지 않는다 — 음성 대조', () => {
    // 늘 튀어나오게 하는 구현도 위 테스트는 통과한다. 괜히 들썩이는 버튼은 그것도 방해다.
    const { rerender } = render(hero(null));
    expect(popped()).toBeNull();
    rerender(hero('chaos'));
    rerender(hero(null));
    expect(popped()).toBeNull();
  });
});

describe('숨기기 — 숨바꼭질', () => {
  const hide = (expiresAt: string | null = null) =>
    render(
      <TodayHero
        workDate="2026-09-18"
        record={null}
        standardWorkMinutes={480}
        canCheckIn
        canCheckOut
        checkingOut={false}
        attackKind="hide"
        attackExpiresAt={expiresAt}
        onCheckIn={vi.fn()}
        onCheckOut={vi.fn()}
      />
    );

  it('가짜 퇴근 버튼이 여럿 뜬다', () => {
    hide();
    expect(screen.getAllByTestId('decoy')).toHaveLength(8);
  });

  it('가짜를 누르면 속았다고 하고 그 가짜는 사라진다', () => {
    const onCheckOut = vi.fn();
    render(
      <TodayHero
        workDate="2026-09-18"
        record={null}
        standardWorkMinutes={480}
        canCheckIn
        canCheckOut
        checkingOut={false}
        attackKind="hide"
        onCheckIn={vi.fn()}
        onCheckOut={onCheckOut}
      />
    );
    fireEvent.click(screen.getAllByTestId('decoy')[0]);
    expect(screen.getByText('속았지롱 🙈')).toBeInTheDocument();
    expect(screen.getAllByTestId('decoy')).toHaveLength(7);
    // 가짜는 기록을 건드리지 않는다
    expect(onCheckOut).not.toHaveBeenCalled();
  });

  it('가짜는 화면 낭독기·키보드에는 보이지 않는다 — 그 사람들은 속이지 않는다', () => {
    hide();
    for (const decoy of screen.getAllByTestId('decoy')) {
      expect(decoy).toHaveAttribute('aria-hidden', 'true');
      expect(decoy.tagName).not.toBe('BUTTON');
      expect(decoy).not.toHaveAttribute('tabindex');
    }
  });

  it('숨은 자리에 남은 초를 보여 준다', () => {
    hide(new Date(Date.now() + 15_000).toISOString());
    expect(screen.getByTestId('checkout-slot')).toHaveTextContent('15');
  });

  it('숨은 자리를 누르면 아직 숨어 있다고 한다', () => {
    hide();
    fireEvent.click(screen.getByTestId('checkout-slot'));
    expect(screen.getByText('아직 숨어 있어요')).toBeInTheDocument();
  });

  it('숨기기가 아니면 가짜는 없다 — 음성 대조', () => {
    show('chaos');
    expect(screen.queryAllByTestId('decoy')).toHaveLength(0);
  });
});

describe('가짜 버튼은 진짜 버튼을 가리지 않는다', () => {
  // 퇴근이 숨은 동안에도 출근(어제 기록이 안 닫힌 채 오늘 출근 전)은 살아 있어야 한다.
  // 가짜가 그 위에 얹히면 장난이 다른 기능을 막게 된다.
  const box = (l: number, t: number, r: number, b: number) =>
    ({
      left: l,
      top: t,
      right: r,
      bottom: b,
      x: l,
      y: t,
      width: r - l,
      height: b - t,
      toJSON: () => ({}),
    }) as DOMRect;
  // 진짜 출근 버튼이 카드 위쪽 절반을 다 차지한다고 둔다
  const CHECK_IN = { l: 0, t: 0, r: 720, b: 150 };

  it('겹치는 자리가 먼저 뽑혀도 비켜 간다', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.hasAttribute('data-chaos-bounds')) return box(0, 0, 720, 300);
      if (this.tagName === 'BUTTON' && this.textContent?.includes('출근'))
        return box(CHECK_IN.l, CHECK_IN.t, CHECK_IN.r, CHECK_IN.b);
      return box(0, 0, 0, 0);
    });
    // 뽑는 순서: x, y. 매번 첫 y 는 출근 버튼과 겹치는 값(0.05), 다음 y 는 비어 있는 값(0.9)
    const seq = [0.1, 0.05, 0.1, 0.9];
    let n = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[n++ % seq.length]);

    render(
      <TodayHero
        workDate="2026-09-18"
        record={null}
        standardWorkMinutes={480}
        canCheckIn
        canCheckOut
        checkingOut={false}
        attackKind="hide"
        onCheckIn={vi.fn()}
        onCheckOut={vi.fn()}
      />
    );

    const decoys = screen.getAllByTestId('decoy');
    expect(decoys.length).toBeGreaterThan(0);
    for (const decoy of decoys) {
      const top = parseFloat(decoy.style.top);
      // 가짜(높이 38)의 윗변이 출근 버튼 아래(150)+여백(8)보다 아래에 있어야 한다
      expect(top).toBeGreaterThanOrEqual(CHECK_IN.b + 8);
    }
    vi.restoreAllMocks();
  });
});

describe('쌓인 숨기기', () => {
  const hideAt = (level: number) =>
    render(
      <TodayHero
        workDate="2026-09-18"
        record={null}
        standardWorkMinutes={480}
        canCheckIn
        canCheckOut
        checkingOut={false}
        attackKind="hide"
        attackLevel={level}
        onCheckIn={vi.fn()}
        onCheckOut={vi.fn()}
      />
    );

  it('쌓인 만큼 가짜가 늘어난다', () => {
    hideAt(2);
    expect(screen.getAllByTestId('decoy')).toHaveLength(9);
  });

  it('열 개가 쌓여도 열 개까지다 — 카드를 가짜로 덮지 않는다', () => {
    hideAt(10);
    expect(screen.getAllByTestId('decoy')).toHaveLength(10);
  });
});

describe('가짜는 생겼다 사라진다', () => {
  const hideAt = (level = 1) =>
    render(
      <TodayHero
        workDate="2026-09-18"
        record={null}
        standardWorkMinutes={480}
        canCheckIn
        canCheckOut
        checkingOut={false}
        attackKind="hide"
        attackLevel={level}
        onCheckIn={vi.fn()}
        onCheckOut={vi.fn()}
      />
    );
  const setReducedMotion = (reduce: boolean) =>
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? reduce : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      }),
    });

  it('하나가 흩어지고 다른 자리에 새로 뜬다 — 가만히 있지 않는다', () => {
    vi.useFakeTimers();
    try {
      setReducedMotion(false);
      hideAt(1);
      const first = screen.getAllByTestId('decoy');
      act(() => {
        vi.advanceTimersByTime(950);
      });
      // 처음 것 중 하나가 흩어지는 중이다
      expect(first.some(el => el.className.includes('animate-poof'))).toBe(true);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      // 흩어진 것은 지워지고, 새로 뜬 것이 있다 — 수는 그대로 여덟
      const now = screen.getAllByTestId('decoy');
      expect(first.some(el => !el.isConnected)).toBe(true);
      expect(now.some(el => !first.includes(el))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('쌓일수록 더 빨리 바뀐다', () => {
    vi.useFakeTimers();
    try {
      setReducedMotion(false);
      hideAt(10); // 0.35초마다
      const first = screen.getAllByTestId('decoy');
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(first.some(el => el.className.includes('animate-poof'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('움직임을 줄여 달라고 한 사람에게는 자리를 지킨다', () => {
    vi.useFakeTimers();
    try {
      setReducedMotion(true);
      hideAt(1);
      const first = screen.getAllByTestId('decoy');
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(first.every(el => el.isConnected && !el.className.includes('animate-poof'))).toBe(
        true
      );
    } finally {
      setReducedMotion(false);
      vi.useRealTimers();
    }
  });
});

describe('좁은 카드에서도 멈추지 않는다', () => {
  // 목표 수만큼 놓을 자리가 없으면 목표보다 적게 찬다. 예전에는 '다 찼을 때만' 하나를
  // 흩어서, 그때부터 흩지도 새로 띄우지도 못하고 그대로 멈춰 있었다.
  const box = (l: number, t: number, r: number, b: number) =>
    ({
      left: l,
      top: t,
      right: r,
      bottom: b,
      x: l,
      y: t,
      width: r - l,
      height: b - t,
      toJSON: () => ({}),
    }) as DOMRect;

  it('자리가 모자라도 계속 흩어지고 새로 뜬다', () => {
    vi.useFakeTimers();
    try {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
      });
      // 가짜 두세 개가 겨우 들어가는 카드. 다른 요소는 크기 0 이라 피할 것이 없다.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        return this.hasAttribute('data-chaos-bounds') ? box(0, 0, 260, 110) : box(0, 0, 0, 0);
      });
      render(
        <TodayHero
          workDate="2026-09-18"
          record={null}
          standardWorkMinutes={480}
          canCheckIn
          canCheckOut
          checkingOut={false}
          attackKind="hide"
          onCheckIn={vi.fn()}
          onCheckOut={vi.fn()}
        />
      );
      const first = screen.getAllByTestId('decoy');
      expect(first.length).toBeLessThan(8); // 목표(8)만큼은 못 놓는다

      act(() => {
        vi.advanceTimersByTime(950 * 3);
      });
      expect(first.some(el => !el.isConnected || el.className.includes('animate-poof'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('퇴근 취소', () => {
  const done = (until: string | null, onUndo = vi.fn()) =>
    render(
      <TodayHero
        workDate="2026-09-18"
        record={{
          id: 1,
          userId: 'me',
          workDate: '2026-09-18',
          checkInAt: new Date(Date.now() - 9 * 3600e3).toISOString(),
          checkOutAt: new Date().toISOString(),
          workMinutes: 540,
          note: '',
          checklist: [],
        }}
        standardWorkMinutes={480}
        canCheckIn={false}
        canCheckOut={false}
        checkingOut={false}
        undoCheckOutUntil={until}
        onUndoCheckOut={onUndo}
        onCheckIn={vi.fn()}
        onCheckOut={vi.fn()}
      />
    );

  it('퇴근 직후에는 취소 단추가 남은 분과 함께 보이고, 누르면 취소를 요청한다', () => {
    const onUndo = vi.fn();
    done(new Date(Date.now() + 9 * 60_000 + 30_000).toISOString(), onUndo);
    const btn = screen.getByRole('button', { name: /퇴근 취소/ });
    expect(btn).toHaveTextContent('10분 남음');
    fireEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('마감이 지났으면 보이지 않는다', () => {
    done(new Date(Date.now() - 1000).toISOString());
    expect(screen.queryByRole('button', { name: /퇴근 취소/ })).not.toBeInTheDocument();
  });

  it('취소할 퇴근이 없으면 보이지 않는다 — 대조', () => {
    done(null);
    expect(screen.queryByRole('button', { name: /퇴근 취소/ })).not.toBeInTheDocument();
  });
});
