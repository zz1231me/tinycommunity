// client/src/utils/lazyWithRetry.ts
import { lazy, ComponentType } from 'react';

/**
 * React.lazy 래퍼 — 코드 스플리팅 청크(dynamic import) 로드가 일시적으로 실패할 때의 복구 로직.
 *
 * 배경: App의 모든 페이지는 lazy(() => import(...))로 로드된다. 이 동적 import가 실패하면
 * React가 그 에러를 throw 하고 전역 ErrorBoundary가 "예상치 못한 오류"를 띄운다.
 * 실패는 대개 "일시적"이라 사용자가 새로고침하면 정상 접속된다:
 *   - 개발: Vite가 deps를 재최적화하면 청크 URL의 ?v= 해시가 바뀌어 이전 요청이 504(Outdated Optimize Dep)
 *   - 배포: 새 빌드 배포 후 브라우저가 캐시한 index가 사라진 해시 청크를 요청 → 404
 *   - 공통: 네트워크 순단
 *
 * 대응:
 *   1) import를 짧은 백오프로 몇 번 재시도(네트워크 순단 흡수)
 *   2) 그래도 실패하면 오래된 청크일 가능성이 높으므로 "한동안 리로드한 적 없을 때만" 1회 하드 리로드해
 *      최신 index+청크를 받는다(리로드 루프 방지를 위해 시간 가드).
 *   3) 방금 리로드했는데도 실패하면 진짜 에러이므로 throw → ErrorBoundary가 처리.
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
