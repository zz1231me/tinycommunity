// React Query 재시도 정책.

/**
 * 4xx 는 재시도하지 않는다. 401 은 axios 인터셉터가 리다이렉트를 걸어 반복된다.
 * 네트워크 오류·5xx 만 두 번까지 재시도한다.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return failureCount < 2;
}
