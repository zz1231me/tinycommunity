// 지금 걸려 있는 공격을 서버가 준 줄에서 직접 고르고, 다음 경계에 맞춰 다시 그린다.

import { useEffect, useState } from 'react';
import type { AttackState, IncomingAttack } from '../api/attendance';

export interface ActiveAttack {
  /** 지금 걸려 있는 공격 (없으면 null) */
  active: IncomingAttack | null;
  /** 지금 것 뒤에 기다리는 공격 수 */
  waiting: number;
  /** 바로 다음에 올 공격 */
  next: IncomingAttack | null;
  /** 쌓인 것이 전부 풀리는 시각 */
  endsAt: string | null;
  /** 아직 끝나지 않은 줄 전체 */
  queue: IncomingAttack[];
}

const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** 줄에서 다음에 화면이 바뀌어야 하는 시각 */
function nextBoundary(queue: IncomingAttack[], now: number): number | null {
  const times: number[] = [];
  for (const q of queue) {
    const starts = at(q.startsAt);
    const ends = at(q.expiresAt);
    if (starts > now) times.push(starts);
    if (ends > now) times.push(ends);
  }
  return times.length > 0 ? Math.min(...times) : null;
}

/**
 * @param state  서버에서 받은 공격 상태
 * @param clockOffset 서버 시각 − 내 시계. 어긋난 시계에서도 서버 기준으로 고른다.
 */
export function useAttackQueue(state: AttackState | undefined, clockOffset = 0): ActiveAttack {
  // 경계마다 다시 그리기 위한 값. 내용은 쓰지 않는다.
  const [, setTick] = useState(0);

  const now = Date.now() + clockOffset;
  const queue = (state?.queue ?? []).filter(q => at(q.expiresAt) > now);
  // startsAt 이 없는 옛 행은 이미 시작한 것으로 보고, 시작한 것이 없으면 줄 맨 앞을 쓴다.
  const started = queue.find(q => !q.startsAt || at(q.startsAt) <= now);
  const active = started ?? queue[0] ?? null;
  const rest = active ? queue.slice(queue.indexOf(active) + 1) : queue;

  const boundary = nextBoundary(queue, now);
  useEffect(() => {
    if (boundary === null) return;
    // 경계에 맞춰 한 번만 깨운다.
    const id = window.setTimeout(
      () => setTick(t => t + 1),
      Math.max(0, boundary - (Date.now() + clockOffset)) + 30
    );
    return () => window.clearTimeout(id);
  }, [boundary, clockOffset]);

  return {
    active,
    waiting: rest.length,
    next: rest[0] ?? null,
    endsAt: queue.length > 0 ? queue[queue.length - 1].expiresAt : null,
    queue,
  };
}
