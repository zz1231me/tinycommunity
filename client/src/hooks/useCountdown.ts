// client/src/hooks/useCountdown.ts
//
// 어느 시각까지 남은 초. 1초마다 다시 세고, 0 이 되면 한 번만 알린다.
// 출근 화면의 공격 안내 줄과 포인트 탭의 경고 띠가 같은 공격을 함께 센다.

import { useEffect, useRef, useState } from 'react';

/**
 * 남은 초. offsetMs 는 '서버 시각 − 내 시계' 다 — 시계가 어긋난 PC 에서도 서버 기준으로 센다.
 * (몇 분 빠른 시계에서는 걸려 있는 공격이 이미 끝난 것으로 보여 아무 일도 일어나지 않았다.)
 */
export function secondsLeft(expiresAt: string, offsetMs = 0): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - (Date.now() + offsetMs)) / 1000));
}

/** 남은 초를 읽기 좋게 — 쌓인 공격은 몇 분이 되기도 한다 */
export function formatLeft(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/**
 * 줄에서 아직 끝나지 않은 공격 — 서버에서 받은 뒤 시간이 흘러 끝난 것은 뺀다.
 * 다시 받아 오기 전에도 쌓인 수와 전체 남은 시간이 거짓말을 하지 않게.
 */
export function liveOnly<T extends { expiresAt: string }>(queue: T[], now = Date.now()): T[] {
  return queue.filter(q => new Date(q.expiresAt).getTime() > now);
}

export function useCountdown(expiresAt: string, onDone?: () => void, offsetMs = 0): number {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt, offsetMs));
  // onDone 이 매 렌더 새 함수여도 타이머를 다시 깔지 않는다 — 기준은 시각이다
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    setLeft(secondsLeft(expiresAt, offsetMs));
    const id = window.setInterval(() => {
      const next = secondsLeft(expiresAt, offsetMs);
      setLeft(next);
      if (next <= 0) {
        window.clearInterval(id);
        done.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, offsetMs]);

  return left;
}
