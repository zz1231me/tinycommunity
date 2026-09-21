import { lazy, ComponentType } from 'react';

/**
 * React.lazy 래퍼. 동적 import 가 실패하면 재시도하고, 그래도 안 되면 1회 하드 리로드한다.
 */
// React.lazy 와 같은 제약(ComponentType<any>)이라야 props 있는 페이지와 변성 충돌이 없다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  opts: { retries?: number; interval?: number } = {}
) {
  const { retries = 2, interval = 400 } = opts;
  const RELOAD_TS_KEY = 'chunk-reload-ts';
  const RELOAD_COOLDOWN_MS = 10_000;

  return lazy(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await factory();
      } catch (err) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, interval * (attempt + 1)));
          continue;
        }
        // 재시도 소진. 오래된 청크일 수 있으니 쿨다운 밖이면 1회 하드 리로드.
        const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
        if (Date.now() - last > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
          window.location.reload();
          // 리로드 중에는 렌더하지 않도록 영원히 pending 인 Promise 를 돌려준다.
          return new Promise<{ default: T }>(() => {});
        }
        // 방금 리로드했는데도 실패하면 실제 에러다. ErrorBoundary 로 넘긴다.
        throw err;
      }
    }
  });
}
