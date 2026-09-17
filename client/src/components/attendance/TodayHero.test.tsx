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

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TodayHero } from './TodayHero';
import type { AttackKind } from '../../api/attendance';

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
    expect(screen.getByText('퇴근')).toBeInTheDocument();
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
