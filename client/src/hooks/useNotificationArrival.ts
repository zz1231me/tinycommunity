// client/src/hooks/useNotificationArrival.ts
//
// 어떤 종류의 알림이 새로 도착하면 콜백을 부른다.
//
// 알림은 SSE 로 바로 오는데, 그와 관련된 화면(출근 화면의 공격 효과, 포인트 탭의 대결 판)은
// 각자 따로 서버에 묻는다. 둘이 이어져 있지 않아서, 공격을 받거나 도전장이 와도 종 숫자만
// 바뀌고 화면은 새로고침을 해야 바뀌었다. 이 훅이 그 둘을 잇는다.

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../store/notifications';
import type { Notification } from '../api/notifications';

export function useNotificationArrival(
  /** 볼 종류들, 또는 'all' — 서버가 먼저 늘린 새 종류까지 빠짐없이 본다 */
  types: ReadonlyArray<Notification['type']> | 'all',
  onArrive: () => void
): void {
  // 원하는 종류들의 도착 횟수 합. 이 수가 늘면 새로 온 것이 있다는 뜻이다.
  const count = useNotificationStore(s =>
    types === 'all'
      ? Object.values(s.arrivals).reduce((sum: number, v) => sum + (v ?? 0), 0)
      : types.reduce((sum, t) => sum + (s.arrivals[t] ?? 0), 0)
  );

  // 콜백이 매 렌더 새 함수여도 도착 한 번에 한 번만 부른다
  const callback = useRef(onArrive);
  useEffect(() => {
    callback.current = onArrive;
  });

  // 처음 그릴 때 이미 쌓여 있던 수는 신호가 아니다 — 이 화면을 연 뒤에 온 것만 본다
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) callback.current();
    seen.current = count;
  }, [count]);
}
