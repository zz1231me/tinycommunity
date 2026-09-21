// client/src/hooks/useAttackQueue.test.tsx
// 쌓인 공격이 차례로 넘어갈 때 화면이 끊기지 않는가.
//
// 예전에는 서버가 계산해 준 incoming 하나만 봤다. 그 값은 마지막으로 물어본 시점의
// 답이라, 앞 공격이 끝나고 다음 것이 시작되는 사이에는 '공격이 없는 상태' 가 됐다 —
// 다시 묻는 주기가 10초라 경고 띠가 사라지고 퇴근 버튼이 멀쩡해졌다가 갑자기 다시
// 사나워졌다. 받아 둔 줄만 보면 기다릴 이유가 없는 정보다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useAttackQueue } from './useAttackQueue';
import type { AttackState, IncomingAttack } from '../api/attendance';

const iso = (ms: number) => new Date(ms).toISOString();

/** 30초짜리 방해 뒤에 20초짜리 숨기기가 줄을 선 상태 */
function stackedState(base: number): AttackState {
  const rows: IncomingAttack[] = [
    {
      id: 1,
      attackerId: 'a',
      attackerName: '첫째',
      kind: 'chaos',
      startsAt: iso(base),
      expiresAt: iso(base + 30_000),
    },
    {
      id: 2,
      attackerId: 'b',
      attackerName: '둘째',
      kind: 'hide',
      startsAt: iso(base + 30_000),
      expiresAt: iso(base + 50_000),
    },
  ];
  return {
    now: iso(base),
    rules: {
      cost: 300,
      hideCost: 300,
      defendCost: 200,
      blockSeconds: 30,
      hideSeconds: 20,
      dailyLimit: 5,
      maxStack: 20,
    },
    balance: 1000,
    incoming: rows[0],
    queue: rows,
    usedToday: 0,
    remainingToday: 5,
  };
}

function Probe({ state }: { state: AttackState }) {
  const { active, waiting, next, endsAt } = useAttackQueue(state);
  return (
    <div>
      <span data-testid="kind">{active ? active.kind : '없음'}</span>
      <span data-testid="waiting">{waiting}</span>
      <span data-testid="next">{next ? next.kind : '없음'}</span>
      <span data-testid="ends">{endsAt ?? '없음'}</span>
    </div>
  );
}

const kind = () => screen.getByTestId('kind').textContent;

describe('쌓인 공격이 차례로 넘어갈 때', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('앞 공격이 끝나는 순간 다음 공격으로 넘어간다 — 다시 묻지 않고', () => {
    const base = Date.now();
    render(<Probe state={stackedState(base)} />);

    expect(kind()).toBe('chaos');
    expect(screen.getByTestId('waiting').textContent).toBe('1');
    // 다음에 무엇이 오는지 미리 알 수 있어야 갑자기 버튼이 사라져도 고장으로 읽히지 않는다
    expect(screen.getByTestId('next').textContent).toBe('hide');

    // 첫 공격이 끝나는 순간
    act(() => void vi.advanceTimersByTime(30_100));

    // 서버에 다시 묻지 않았는데도 이미 다음 공격이다 (예전에는 최대 10초 동안 '없음')
    expect(kind()).toBe('hide');
    expect(screen.getByTestId('waiting').textContent).toBe('0');
  });

  it('줄이 다 끝나면 비로소 풀린다', () => {
    const base = Date.now();
    render(<Probe state={stackedState(base)} />);

    act(() => void vi.advanceTimersByTime(50_100));

    expect(kind()).toBe('없음');
    expect(screen.getByTestId('ends').textContent).toBe('없음');
  });
});
