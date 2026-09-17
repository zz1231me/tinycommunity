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
import { fireEvent, render, screen } from '@testing-library/react';
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
 * EFFECTS = ['calm','dodge','dodge','vanish','blackout'] 에서 floor(r*5) 로 고른다.
 */
const PICK = { calm: 0.05, dodge: 0.25, vanish: 0.75, blackout: 0.95 };

function forceEffect(value: number) {
  vi.spyOn(Math, 'random').mockReturnValue(value);
}

const Target = ({ onClick }: { onClick?: () => void }) => (
  <button type="button" onClick={onClick}>
    퇴근
  </button>
);

/** 바깥 껍데기 / 움직이는 껍데기 / 암막 */
function parts(container: HTMLElement) {
  const outer = container.firstElementChild as HTMLElement | null;
  const mover = outer?.firstElementChild as HTMLElement | null;
  const overlay = outer?.children?.[1] as HTMLElement | undefined;
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
