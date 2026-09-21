// 서버까지 닿지 못한 오류의 원문은 영어라("Network Error", "timeout of 30000ms exceeded")
// 화면에 그대로 내보낼 수 없다. 응답을 받은 오류는 서버가 한국어로 주므로 건드리지 않는다.

export const CONNECT_FAILED =
  '서버에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.';
export const TIMED_OUT = '서버 응답이 너무 늦습니다. 잠시 후 다시 시도해주세요.';

type MaybeAxiosError = {
  code?: string;
  message?: string;
  response?: unknown;
};

/** 응답을 못 받은 axios 오류의 message 를 한국어로 바꾼다. 취소는 재시도 판정에 쓰이므로 그대로 둔다. */
export function localizeTransportError(error: unknown): void {
  if (!error || typeof error !== 'object') return;
  const err = error as MaybeAxiosError;
  if (err.response) return;
  if (err.code === 'ERR_CANCELED') return;
  err.message = err.code === 'ECONNABORTED' ? TIMED_OUT : CONNECT_FAILED;
}

/** fetch 는 회선 문제일 때 TypeError("Failed to fetch") 를 던진다. */
export function isFetchNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/** 화면에 그대로 띄울 문구를 고른다. fetch 로 부른 곳에서 쓴다. */
export function messageFor(error: unknown, fallback: string): string {
  if (isFetchNetworkError(error)) return CONNECT_FAILED;
  return error instanceof Error ? error.message : fallback;
}
