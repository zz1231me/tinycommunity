// client/src/hooks/useAttackQueue.ts
// 지금 이 순간 걸려 있는 공격이 무엇인가 — 서버가 준 줄(queue)에서 직접 고른다.
//
// 예전에는 서버가 계산해 준 incoming 하나만 봤다. 그 값은 '마지막으로 물어본 시점' 의
// 답이라, 앞 공격이 끝나고 다음 것이 시작되는 사이에는 공격이 아예 없는 것처럼 보였다 —
// 다시 물어보는 주기가 10초라 최대 10초 동안 경고 띠가 사라지고 퇴근 버튼이 멀쩡해졌다가
// 갑자기 다시 사나워졌다. 줄과 각자의 시각은 이미 다 받아 두었으므로 기다릴 이유가 없다.
//
// 그래서 두 가지를 한다: (1) 지금 시각으로 줄에서 직접 고르고, (2) 다음 경계(지금 것이
// 끝나는 때 / 다음 것이 시작하는 때)에 정확히 맞춰 다시 그린다. 화면이 끊기지 않는다.

import { useEffect, useState } from 'react';
import type { AttackState, IncomingAttack } from '../api/attendance';

export interface ActiveAttack {
  /** 지금 걸려 있는 공격 (없으면 null) */
  active: IncomingAttack | null;
  /** 지금 것 뒤에 기다리는 공격 수 */
  waiting: number;
  /** 바로 다음에 올 공격 — 종류가 바뀌기 전에 미리 알려 준다 */
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
  // 경계마다 다시 그리기 위한 값. 무엇이 들었는지는 중요하지 않다.
  const [, setTick] = useState(0);

  const now = Date.now() + clockOffset;
  const queue = (state?.queue ?? []).filter(q => at(q.expiresAt) > now);
  // startsAt 이 없는 옛 행은 '이미 시작한 것' 으로 본다.
  // 아무것도 시작하지 않은 것으로 보이면 줄의 맨 앞을 쓴다 — 서버가 incoming 이라 부르는
  // 바로 그 행이다. 시계가 몇 분 어긋난 PC 에서 '아직 시작 전' 으로 읽혀 걸린 공격이
  // 통째로 사라지는 일을 막는다(그때는 공격자의 포인트만 사라졌다).
  const started = queue.find(q => !q.startsAt || at(q.startsAt) <= now);
  const active = started ?? queue[0] ?? null;
  const rest = active ? queue.slice(queue.indexOf(active) + 1) : queue;

  const boundary = nextBoundary(queue, now);
  useEffect(() => {
    if (boundary === null) return;
    // 경계에 맞춰 한 번만 깨운다 — 1초마다 깨우면 종류가 바뀌는 순간이 최대 1초 늦는다
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
