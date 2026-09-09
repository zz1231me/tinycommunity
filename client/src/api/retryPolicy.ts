// client/src/api/retryPolicy.ts
// React Query 재시도 정책.

/**
 * 4xx 는 재시도하지 않는다.
 *
 * 권한 부족(403)·없는 리소스(404)는 다시 물어도 답이 같다. 401 은 axios 인터셉터가
 * redirectToLogin() 으로 하드 리다이렉트를 걸어, 재시도하면 리다이렉트가 반복된다.
 *
 * 네트워크 오류·5xx 처럼 일시적일 수 있는 경우만 두 번까지 재시도한다.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return failureCount < 2;
}
