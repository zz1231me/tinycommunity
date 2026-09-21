// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrap<T = any>(res: { data: unknown }): T {
  const d = res.data;
  if (d !== null && typeof d === 'object' && 'data' in d) {
    return (d as { data: T }).data;
  }
  return d as T;
}

/**
 * API 에러에서 사용자용 메시지를 뽑는다. 서버가 내려준 한글 message를 우선한다.
 */
export function getApiErrorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  const anyErr = err as { response?: { data?: { message?: unknown } }; message?: unknown };
  const serverMsg = anyErr?.response?.data?.message;
  if (typeof serverMsg === 'string' && serverMsg.trim()) return serverMsg;
  return fallback;
}
