// client/src/hooks/useNotificationArrival.ts
//
// 어떤 종류의 알림이 새로 도착하면 콜백을 부른다.
//
// 알림은 SSE 로 바로 오는데, 그와 관련된 화면(출근 화면의 공격 띠, 포인트 탭의 대결 판)은
// 각자 따로 서버에 묻는다. 둘이 이어져 있지 않아서, 공격을 받거나 도전장이 와도 종 숫자만
// 바뀌고 화면은 새로고침을 해야 바뀌었다. 이 훅이 그 둘을 잇는다.

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../store/notifications';
import type { Notification } from '../api/notifications';

export function useNotificationArrival(
  types: ReadonlyArray<Notification['type']>,
  onArrive: (notification: Notification) => void
): void {
  const arrived = useNotificationStore(s => s.lastArrived);

  // 콜백이 매 렌더 새 함수여도 알림 하나에 한 번만 부른다 — 기준은 도착한 알림이다
  const callback = useRef(onArrive);
  useEffect(() => {
    callback.current = onArrive;
  });
  const wanted = types.join(',');

  useEffect(() => {
    if (arrived && wanted.split(',').includes(arrived.type)) callback.current(arrived);
  }, [arrived, wanted]);
}
