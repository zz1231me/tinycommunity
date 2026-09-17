// client/src/utils/lazyWithRetry.ts
import { lazy, ComponentType } from 'react';

/**
 * React.lazy 래퍼. 동적 import 가 일시적으로 실패했을 때 복구한다.
 *
 * 실패 원인:
 *   - 개발: Vite 가 deps 를 재최적화하면 청크 URL 의 ?v= 해시가 바뀌어 504
 *   - 배포: 브라우저가 캐시한 index 가 사라진 해시 청크를 요청해 404
 *   - 공통: 네트워크 순단
 *
 * 처리 순서:
 *   1) 짧은 백오프로 몇 번 재시도
 *   2) 실패가 이어지면 최근 리로드가 없었을 때만 1회 하드 리로드(루프 방지용 시간 가드)
 *   3) 리로드 직후에도 실패하면 throw — ErrorBoundary 가 처리한다
 */
// React.lazy와 동일한 제약(ComponentType<any>) — props 있는 페이지(PostEditor 등)와 변성 충돌 방지.
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
        // 재시도 소진 — 오래된 청크(배포/재최적화) 가능성. 쿨다운 밖이면 1회 하드 리로드.
        const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0);
        if (Date.now() - last > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()));
          window.location.reload();
          // 리로드 진행 중 — 이 컴포넌트를 렌더하지 않도록 영원히 pending인 Promise 반환.
          return new Promise<{ default: T }>(() => {});
        }
        // 방금 리로드했는데도 실패 → 실제 에러. ErrorBoundary로 넘긴다.
        throw err;
      }
    }
  });
}
