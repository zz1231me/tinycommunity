// client/src/components/points/WinFanfare.test.tsx
// 이겼을 때의 축하. 화면을 막지 않아야 하고, 움직임을 줄여 달라고 한 사람에게도
// '이겼다' 는 사실은 그대로 보여야 한다(효과만 뺀다).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { WinFanfare } from './WinFanfare';

const matchMedia = (reduce: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('대결에서 이겼을 때', () => {
  it('딴 포인트와 함께 축하가 뜨고, 잠시 뒤 스스로 사라진다', () => {
    vi.stubGlobal('matchMedia', matchMedia(false));
    const onDone = vi.fn();
    const { container } = render(<WinFanfare amount={600} onDone={onDone} />);

    expect(screen.getByText('🎉 이겼습니다!')).toBeInTheDocument();
    expect(screen.getByText('+600P')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-confettiFall').length).toBeGreaterThan(10);

    act(() => void vi.advanceTimersByTime(2000));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('🎉 이겼습니다!')).not.toBeInTheDocument();
  });

  it('화면을 막지 않는다 — 이긴 뒤 바로 한마디를 쓰러 갈 수 있어야 한다', () => {
    vi.stubGlobal('matchMedia', matchMedia(false));
    const { container } = render(<WinFanfare amount={100} onDone={vi.fn()} />);
    expect(container.firstElementChild).toHaveClass('pointer-events-none');
  });

  it('움직임을 줄여 달라고 했으면 조각은 빼고 글자만', () => {
    // 효과가 싫다는 것이지 결과를 모르고 싶다는 뜻이 아니다
    vi.stubGlobal('matchMedia', matchMedia(true));
    const { container } = render(<WinFanfare amount={600} onDone={vi.fn()} />);

    expect(container.querySelectorAll('.animate-confettiFall')).toHaveLength(0);
    expect(screen.getByText('🎉 이겼습니다!')).toBeInTheDocument();
    expect(screen.getByText('+600P')).toBeInTheDocument();
  });
});
