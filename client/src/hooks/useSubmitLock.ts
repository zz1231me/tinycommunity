// 같은 제출이 두 번 나가는 것을 막는다. isPending 은 리렌더 후에야 true 라 ref 로 즉시 잠근다.

import { useCallback, useRef } from 'react';

export function useSubmitLock() {
  const locked = useRef(false);

  /** 진행 중이면 무시하고, 아니면 실행한다. 실패는 호출부가 처리하도록 여기서 삼킨다. */
  const run = useCallback((task: () => Promise<unknown> | void) => {
    if (locked.current) return;
    locked.current = true;
    const unlock = () => {
      // 언마운트 뒤에도 풀어 둬야 다시 쓸 때 잠긴 채로 시작하지 않는다
      locked.current = false;
    };
    let running: Promise<unknown> | void;
    try {
      // 바로 실행한다. 마이크로태스크로 미루면 요청이 그만큼 늦게 나간다.
      running = task();
    } catch (err) {
      unlock();
      throw err;
    }
    Promise.resolve(running).then(unlock, unlock);
  }, []);

  return run;
}
