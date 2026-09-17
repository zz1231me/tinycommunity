// client/src/hooks/useSubmitLock.ts
// 같은 제출이 두 번 나가는 것을 막는다.
//
// 버튼을 `disabled={mutation.isPending}` 으로만 막으면 부족하다. isPending 은 리렌더가
// 끝나야 true 가 되는데, 마우스 더블클릭은 그 사이에 두 번째 클릭을 넣는다 —
// 두 요청이 모두 나가 메시지가 두 통 간다(실제로 재현된 버그다).
//
// ref 는 바로 바뀌므로 같은 틱에 들어온 두 번째 호출을 그 자리에서 막는다.

import { useCallback, useRef } from 'react';

export function useSubmitLock() {
  const locked = useRef(false);

  /**
   * 진행 중이면 무시하고, 아니면 실행한다. 끝나면 스스로 풀린다.
   *
   * 실패는 여기서 삼킨다 — 오류 처리는 부르는 쪽(mutation 의 onError)이 한다.
   * finally 만 붙이면 거절이 그대로 흘러 '처리 안 된 거절' 이 된다.
   */
  const run = useCallback((task: () => Promise<unknown> | void) => {
    if (locked.current) return;
    locked.current = true;
    const unlock = () => {
      // 언마운트된 뒤에도 되돌려 둔다 — 같은 훅을 다시 쓸 때 잠긴 채로 시작하지 않는다
      locked.current = false;
    };
    let running: Promise<unknown> | void;
    try {
      // 바로 실행한다 — 마이크로태스크로 미루면 요청이 그만큼 늦게 나간다
      running = task();
    } catch (err) {
      unlock();
      throw err;
    }
    Promise.resolve(running).then(unlock, unlock);
  }, []);

  return run;
}
