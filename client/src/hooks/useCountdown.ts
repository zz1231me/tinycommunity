// 어느 시각까지 남은 초를 1초마다 다시 세고, 0 이 되면 한 번 알린다.

import { useEffect, useRef, useState } from 'react';

/** 남은 초. offsetMs 는 '서버 시각 − 내 시계' 로, 시계가 어긋난 PC 에서도 서버 기준으로 센다. */
export function secondsLeft(expiresAt: string, offsetMs = 0): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - (Date.now() + offsetMs)) / 1000));
}

/** 남은 초를 분·초 문자열로 만든다. */
export function formatLeft(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** 아직 끝나지 않은 항목만 남긴다. 서버에서 받은 뒤 만료된 것은 뺀다. */
export function liveOnly<T extends { expiresAt: string }>(queue: T[], now = Date.now()): T[] {
  return queue.filter(q => new Date(q.expiresAt).getTime() > now);
}

export function useCountdown(expiresAt: string, onDone?: () => void, offsetMs = 0): number {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt, offsetMs));
  // onDone 이 매 렌더 새 함수여도 타이머를 다시 깔지 않는다.
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
