// 지정한 종류의 알림이 새로 도착하면 콜백을 부른다. SSE 알림과 화면 갱신을 잇는다.

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../store/notifications';
import type { Notification } from '../api/notifications';

export function useNotificationArrival(
  /** 볼 종류들, 또는 'all' */
  types: ReadonlyArray<Notification['type']> | 'all',
  onArrive: () => void
): void {
  // 원하는 종류들의 도착 횟수 합. 이 수가 늘면 새로 온 것이 있다.
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

  // 처음 그릴 때 이미 쌓여 있던 수는 신호가 아니다
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) callback.current();
    seen.current = count;
  }, [count]);
}
