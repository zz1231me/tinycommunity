// client/src/components/attendance/AttackNotice.test.tsx
//
// 출근 화면의 공격 안내 한 줄. 출근은 업무 화면이라 포인트를 쓰는 일(방어권)은 여기서
// 하지 않는다 — 왜 버튼이 이상한지, 언제 풀리는지, 방어하러 갈 길만 알린다.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AttackNotice } from './AttackNotice';
import type { IncomingAttack } from '../../api/attendance';

const incoming = (over: Partial<IncomingAttack> = {}): IncomingAttack => ({
  id: 1,
  attackerId: 'kim',
  attackerName: '김철수',
  kind: 'chaos',
  startsAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 42_000).toISOString(),
  ...over,
});

const show = (over: Partial<IncomingAttack> = {}) =>
  render(
    <MemoryRouter>
      <AttackNotice incoming={incoming(over)} onExpire={vi.fn()} />
    </MemoryRouter>
  );

describe('출근 화면의 공격 안내', () => {
  it('누가 어떤 공격을 걸었고 얼마나 남았는지 알린다', () => {
    show();
    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('김철수님의 퇴근 방해');
    expect(line).toHaveTextContent('42초 남음');
  });

  it('숨기기는 숨기기라고 적는다', () => {
    show({ kind: 'hide' });
    expect(screen.getByRole('status')).toHaveTextContent('버튼 숨기기');
  });

  it('방어는 포인트 탭으로 안내한다 — 여기서 포인트를 쓰지 않는다', () => {
    show();
    expect(screen.getByRole('link', { name: /포인트에서 방어하기/ })).toHaveAttribute(
      'href',
      '/profile?tab=points'
    );
    // 구매 버튼이 없다
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('시간이 다 되면 곧 풀린다고 한다', () => {
    show({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(screen.getByRole('status')).toHaveTextContent('곧 풀립니다');
  });
});

describe('쌓인 공격', () => {
  it('쌓인 수와 대기 수, 전부 풀리기까지의 시간을 알린다', () => {
    const now = Date.now();
    const at = (s: number) => new Date(now + s * 1000).toISOString();
    const queue = [
      incoming({ id: 1, startsAt: at(-10), expiresAt: at(50) }),
      incoming({ id: 2, attackerName: '이영희', startsAt: at(50), expiresAt: at(110) }),
      incoming({ id: 3, kind: 'hide', startsAt: at(110), expiresAt: at(130) }),
    ];
    render(
      <MemoryRouter>
        <AttackNotice incoming={queue[0]} queue={queue} onExpire={vi.fn()} />
      </MemoryRouter>
    );
    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('×3');
    expect(line).toHaveTextContent('2개 대기');
    expect(line).toHaveTextContent('전체 2분 10초 남음');
  });
});
