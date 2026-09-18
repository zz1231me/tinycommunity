// client/src/components/attendance/ChaosButton.test.tsx
//
// 이 컴포넌트의 존재 이유는 '성가시게 하되 막지는 않는다' 이다.
//
// ⚠️ fireEvent.click 으로는 이 성질을 확인할 수 없다. fireEvent 는 이벤트를 요소에
// 바로 꽂기 때문에 pointer-events 를 무시한다 — 실제로 클릭이 막히는 구현으로 바꿔도
// 그 테스트는 그대로 통과했다(직접 깨뜨려 확인함). 그래서 '막지 않는다' 는
// 눌러 보는 대신 구조로 못박는다:
//   · 버튼에 disabled 가 걸리지 않는다
//   · 움직이는 껍데기가 pointer-events 를 끄지 않는다
//   · 눈을 가리는 암막은 pointer-events-none 이라 클릭이 통과한다
//
// 연출은 무작위로 돌아가므로 Math.random 을 고정해 원하는 연출을 집어서 본다.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChaosButton } from './ChaosButton';

function setReducedMotion(reduce: boolean) {
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
}

/**
 * 연출을 골라 고정한다.
 * EFFECTS = ['calm','dodge','shake','vanish','blackout'] 에서 floor(r*5) 로 고른다.
 */
const PICK = { calm: 0.05, dodge: 0.25, shake: 0.5, vanish: 0.75, blackout: 0.95 };

function forceEffect(value: number) {
  vi.spyOn(Math, 'random').mockReturnValue(value);
}

const Target = ({ onClick }: { onClick?: () => void }) => (
  <button type="button" onClick={onClick}>
    퇴근
  </button>
);

/** 바깥 껍데기(원래 자리) / 움직이는 껍데기 / 암막(움직이는 껍데기 안 — 버튼을 따라간다) */
function parts(container: HTMLElement) {
  const outer = container.firstElementChild as HTMLElement | null;
  const mover = outer?.firstElementChild as HTMLElement | null;
  const overlay = (mover?.querySelector(':scope > [aria-hidden]') ?? undefined) as
    HTMLElement | undefined;
  return { outer, mover, overlay };
}

beforeEach(() => setReducedMotion(false));
afterEach(() => vi.restoreAllMocks());

describe('막지 않는다 — 구조로 확인한다', () => {
  it('공격 중에도 버튼에 disabled 가 걸리지 않는다', () => {
    forceEffect(PICK.dodge);
    render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    expect(screen.getByRole('button', { name: '퇴근' })).toBeEnabled();
  });

  it('움직이는 껍데기가 클릭을 끄지 않는다', () => {
    forceEffect(PICK.dodge);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    const { mover } = parts(container);
    // 여기에 pointerEvents:'none' 이 들어가면 버튼은 영영 눌리지 않는다
    expect(mover?.style.pointerEvents).not.toBe('none');
  });

  it('사라져 보여도 클릭은 살아 있다', () => {
    forceEffect(PICK.vanish);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    const { mover } = parts(container);
    // 눈에는 안 보이지만(opacity 0) 누를 수는 있어야 한다
    expect(mover?.style.opacity).toBe('0');
    expect(mover?.style.pointerEvents).not.toBe('none');
    expect(screen.getByRole('button', { name: '퇴근' })).toBeEnabled();
  });

  it('암막은 눈만 가린다 — 클릭은 통과한다', () => {
    forceEffect(PICK.blackout);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    const { overlay } = parts(container);
    expect(overlay).toBeTruthy();
    // 이 클래스가 빠지면 암막이 퇴근 버튼을 통째로 삼킨다
    expect(overlay?.className).toContain('pointer-events-none');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
  });

  it('달아난 뒤에도 껍데기가 클릭을 끄지 않는다', () => {
    forceEffect(PICK.dodge);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    const { mover } = parts(container);
    if (mover) fireEvent.mouseEnter(mover);

    expect(parts(container).mover?.style.pointerEvents).not.toBe('none');
    expect(screen.getByRole('button', { name: '퇴근' })).toBeEnabled();
  });

  it('클릭 핸들러는 그대로 이어진다', () => {
    // fireEvent 는 pointer-events 를 무시하므로 이것만으로는 '안 막힌다' 를 증명하지
    // 못한다. 다만 버튼이 감싸이면서 핸들러가 끊기지는 않았는지는 확인해 준다.
    forceEffect(PICK.dodge);
    const onClick = vi.fn();
    render(
      <ChaosButton active>
        <Target onClick={onClick} />
      </ChaosButton>
    );

    fireEvent.click(screen.getByRole('button', { name: '퇴근' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('카드 밖으로 밀려나지 않는다', () => {
  // 이 버튼은 카드(overflow-hidden) 의 오른쪽 끝에 붙어 있다. 오른쪽으로 밀리면
  // 잘려 나가고, 잘린 자리는 그려지지 않을 뿐 아니라 마우스 클릭도 받지 못한다.
  // 그러면 '성가시게' 가 '못 누르게' 로 바뀐다.
  function offsetX(container: HTMLElement): number {
    const mover = (container.firstElementChild as HTMLElement)?.firstElementChild as HTMLElement;
    const found = (mover?.style.transform ?? '').match(/translate\((-?\d+)px/);
    return found ? Number(found[1]) : 0;
  }

  it('달아날 때 오른쪽으로는 가지 않는다', () => {
    // 예전 판은 (random-0.5)*140 이라 이 값에서 +70px 만큼 오른쪽으로 나갔다
    forceEffect(0.999);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    expect(offsetX(container)).toBeLessThanOrEqual(0);
  });

  it('마우스를 올려 달아날 때도 오른쪽으로는 가지 않는다', () => {
    forceEffect(0.999);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    const mover = (container.firstElementChild as HTMLElement)?.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(mover);
    expect(offsetX(container)).toBeLessThanOrEqual(0);
  });

  it('왼쪽으로도 카드를 벗어날 만큼 멀리 가지는 않는다', () => {
    forceEffect(0.999);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    expect(offsetX(container)).toBeGreaterThan(-140);
  });
});

describe('연출을 걸지 않아야 할 때', () => {
  it('공격이 없으면 아무것도 감싸지 않는다', () => {
    const { container } = render(
      <ChaosButton active={false}>
        <Target />
      </ChaosButton>
    );
    expect(container.querySelector('span')).toBeNull();
    expect(screen.getByRole('button', { name: '퇴근' })).toBeEnabled();
  });

  it('움직임을 줄여 달라고 한 사람에게는 연출하지 않는다', () => {
    setReducedMotion(true);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    // 그 설정을 켠 사람에게 이건 재미가 아니라 못 쓰는 화면이다
    expect(container.querySelector('span')).toBeNull();
    expect(screen.getByRole('button', { name: '퇴근' })).toBeEnabled();
  });
});

describe('부르르 떨기', () => {
  it('떨어도 클릭은 살아 있다', () => {
    forceEffect(PICK.shake);
    const onClick = vi.fn();
    const { container } = render(
      <ChaosButton active>
        <Target onClick={onClick} />
      </ChaosButton>
    );
    const { mover } = parts(container);
    expect(mover?.className).toContain('animate-chaosShake');
    fireEvent.click(screen.getByRole('button', { name: '퇴근' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('카드 안 어디로든 달아난다', () => {
  // 예전에는 왼쪽 96px·위아래 18px 안에서만 움직여 누르기가 너무 쉬웠다.
  // 이제 카드([data-chaos-bounds])와 버튼의 원래 자리를 재서 카드 안 전체를 쓴다.
  type Box = { left: number; top: number; right: number; bottom: number };
  const rect = ({ left, top, right, bottom }: Box) =>
    ({
      left,
      top,
      right,
      bottom,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      toJSON: () => ({}),
    }) as DOMRect;

  /** 카드와 버튼 자리를 정해 둔다 — happy-dom 은 크기를 계산하지 않는다 */
  function layout(card: Box, home: Box) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return rect(this.hasAttribute('data-chaos-bounds') ? card : home);
    });
  }

  const CARD = { left: 0, top: 0, right: 800, bottom: 300 };
  function renderInCard() {
    const { container } = render(
      <div data-chaos-bounds>
        <ChaosButton active>
          <Target />
        </ChaosButton>
      </div>
    );
    const home = container.firstElementChild!.firstElementChild as HTMLElement;
    const mover = home.firstElementChild as HTMLElement;
    const at = () => {
      const m = (mover.style.transform ?? '').match(/translate\((-?\d+)px, (-?\d+)px\)/);
      return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
    };
    return { mover, at };
  }

  it('예전 범위(왼쪽 96px)보다 훨씬 멀리 간다', () => {
    // 데스크톱: 버튼이 카드 오른쪽 끝에 있다
    layout(CARD, { left: 700, top: 200, right: 780, bottom: 236 });
    forceEffect(PICK.dodge);
    const { at } = renderInCard();
    expect(at().x).toBeLessThan(-400);
  });

  it('그래도 카드 밖으로는 나가지 않는다 — 가장자리 12px 안쪽에 멈춘다', () => {
    layout(CARD, { left: 700, top: 200, right: 780, bottom: 236 });
    forceEffect(0.999);
    const { mover, at } = renderInCard();
    fireEvent.mouseEnter(mover);
    const { x, y } = at();
    // 버튼(80×36)이 카드(800×300) 안에 온전히 남는 범위
    expect(700 + x).toBeGreaterThanOrEqual(12);
    expect(780 + x).toBeLessThanOrEqual(800 - 12);
    expect(200 + y).toBeGreaterThanOrEqual(12);
    expect(236 + y).toBeLessThanOrEqual(300 - 12);
  });

  it('오른쪽에 자리가 있으면 오른쪽으로도 간다 — 휴대폰에서는 버튼이 왼쪽에 있다', () => {
    layout(
      { left: 0, top: 0, right: 375, bottom: 300 },
      { left: 20, top: 200, right: 100, bottom: 236 }
    );
    forceEffect(0.999);
    const { mover, at } = renderInCard();
    fireEvent.mouseEnter(mover);
    expect(at().x).toBeGreaterThan(100);
  });

  it('마우스를 대도 가끔은 달아나지 않는다 — 끈질기면 잡힌다', () => {
    // 매번 달아나면 마우스로는 영영 못 누른다. 그러면 '성가시게' 가 '못 누르게' 가 된다.
    layout(CARD, { left: 700, top: 200, right: 780, bottom: 236 });
    forceEffect(0.1); // calm 으로 시작하고, 달아날지 고르는 값도 0.1 (< 0.25)
    const { mover, at } = renderInCard();
    fireEvent.mouseEnter(mover);
    expect(at()).toEqual({ x: 0, y: 0 });
  });
});

describe('쌓인 만큼 사나워진다', () => {
  // 마우스를 대도 안 달아나는 비율: 하나일 때 25%, 쌓일수록 줄어 최소 10%.
  // 달아나는지는 Math.random() < 그 비율 이면 봐준다.
  function renderAt(level: number) {
    const { container } = render(
      <ChaosButton active level={level}>
        <Target />
      </ChaosButton>
    );
    const { mover } = parts(container);
    return { mover: mover!, moved: () => (mover?.style.transform ?? '') !== 'translate(0px, 0px)' };
  }

  /** 달아날지 정하는 값만 따로 준다 — 그 뒤 자리는 다른 값으로 뽑아야 달아났는지가 보인다 */
  function hoverWith(mover: HTMLElement, missRoll: number) {
    vi.spyOn(Math, 'random').mockReturnValueOnce(missRoll).mockReturnValue(0.9);
    fireEvent.mouseEnter(mover);
  }

  it('하나일 때 봐주던 경우도, 열 개 쌓이면 달아난다', () => {
    forceEffect(PICK.calm); // 제자리에서 시작한다
    const one = renderAt(1);
    hoverWith(one.mover, 0.2); // 0.2 < 25% — 봐준다
    expect(one.moved()).toBe(false);

    forceEffect(PICK.calm);
    const ten = renderAt(10);
    hoverWith(ten.mover, 0.2); // 0.2 ≥ 10% — 달아난다
    expect(ten.moved()).toBe(true);
  });

  it('열 개가 쌓여도 가끔은 달아나지 않는다 — 끈질기면 잡힌다', () => {
    forceEffect(PICK.calm);
    const ten = renderAt(10);
    hoverWith(ten.mover, 0.05); // 0.05 < 10% — 봐준다
    expect(ten.moved()).toBe(false);
  });
});

describe('달아난 자리에 머문다', () => {
  // 연출은 1.2초마다 바뀐다. 예전에는 '도망' 이 아닌 연출로 바뀔 때마다 제자리로 되돌려,
  // 멀리 달아났던 버튼이 곧 원래 자리로 순간이동해 돌아와 있었다 — 그 자리만 노리면 됐다.
  it('다른 연출로 바뀌어도 제자리로 돌아가지 않는다', () => {
    vi.useFakeTimers();
    try {
      forceEffect(PICK.dodge);
      const { container } = render(
        <ChaosButton active>
          <Target />
        </ChaosButton>
      );
      const fled = parts(container).mover!.style.transform;
      expect(fled).not.toBe('translate(0px, 0px)');

      // 다음 연출은 평온 — 자리는 그대로여야 한다
      vi.spyOn(Math, 'random').mockReturnValue(PICK.calm);
      act(() => {
        vi.advanceTimersByTime(1300);
      });
      expect(parts(container).mover!.style.transform).toBe(fled);
    } finally {
      vi.useRealTimers();
    }
  });

  it('공격이 끝나면 제자리로 돌아간다 — 대조', () => {
    forceEffect(PICK.dodge);
    const { container, rerender } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    expect(parts(container).mover!.style.transform).not.toBe('translate(0px, 0px)');
    rerender(
      <ChaosButton active={false}>
        <Target />
      </ChaosButton>
    );
    // 연출이 풀리면 버튼만 남는다(감싸는 껍데기가 없다)
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });

  it('암막은 버튼을 따라간다 — 달아난 버튼을 가린다', () => {
    // 암막이 원래 자리에 붙어 있으면, 버튼이 달아나 있을 때 빈자리만 까맣게 가렸다
    forceEffect(PICK.blackout);
    const { container } = render(
      <ChaosButton active>
        <Target />
      </ChaosButton>
    );
    const { mover, overlay } = parts(container);
    expect(overlay?.parentElement).toBe(mover);
  });
});
