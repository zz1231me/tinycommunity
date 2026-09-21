// client/src/components/attendance/useBlinkingTitle.ts
// 알림이 떠 있는 동안 탭 제목을 번갈아 보여 준다. (컴포넌트 파일에서 따로 뺐다 —
// 컴포넌트가 아닌 것을 같이 내보내면 편집 중 화면 새로고침이 통째로 일어난다.)

import { useEffect } from 'react';

const BLINK_MS = 1_000;

/**
 * 알림이 떠 있는 동안 탭 제목을 번갈아 보여 준다.
 *
 * 처음 제목을 한 번만 기억해 두면 안 된다 — 이 알림은 시계가 여는 것이라 글을 읽는
 * 도중에도 시작되고, 그 사이 다른 화면으로 옮겨 가면 제목의 주인이 바뀐다. 한 번
 * 기억한 값을 계속 되돌려 쓰면 엉뚱한 글 제목이 깜빡이고, 알림을 닫은 뒤에도 그
 * 제목이 그대로 남는다. 깜빡일 때마다 그 순간의 제목을 주인으로 삼는다.
 */
export function useBlinkingTitle(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;
    let base = document.title;
    let showing = false;
    const timer = window.setInterval(() => {
      showing = !showing;
      // 내가 써 놓은 문구가 아니면 그 사이 다른 화면이 제목을 가져간 것이다 —
      // 되돌리지 말고 그쪽을 새 주인으로 삼는다
      if (document.title !== message) base = document.title;
      if (showing) document.title = message;
      else if (document.title === message) document.title = base;
    }, BLINK_MS);
    return () => {
      window.clearInterval(timer);
      // 내가 써 놓은 값일 때만 되돌린다 — 그 사이 다른 화면이 정한 제목을 덮지 않게
      if (document.title === message) document.title = base;
    };
  }, [active, message]);
}
