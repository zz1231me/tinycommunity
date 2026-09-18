// client/src/hooks/useCountdown.ts
//
// 어느 시각까지 남은 초. 1초마다 다시 세고, 0 이 되면 한 번만 알린다.
// 출근 화면의 공격 안내 줄과 포인트 탭의 경고 띠가 같은 공격을 함께 센다.

import { useEffect, useRef, useState } from 'react';

export function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function useCountdown(expiresAt: string, onDone?: () => void): number {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt));
  // onDone 이 매 렌더 새 함수여도 타이머를 다시 깔지 않는다 — 기준은 시각이다
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    setLeft(secondsLeft(expiresAt));
    const id = window.setInterval(() => {
      const next = secondsLeft(expiresAt);
      setLeft(next);
      if (next <= 0) {
        window.clearInterval(id);
        done.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return left;
}
