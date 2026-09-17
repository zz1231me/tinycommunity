// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrap<T = any>(res: { data: unknown }): T {
  const d = res.data;
  if (d !== null && typeof d === 'object' && 'data' in d) {
    return (d as { data: T }).data;
  }
  return d as T;
}

/**
 * API 에러에서 사용자용 메시지를 뽑는다.
 * axios 에러는 message가 "Request failed with status code 413"처럼 영문이라,
 * 서버가 내려준 response.data.message(한글)를 우선 사용하고 없으면 fallback을 쓴다.
 */
export function getApiErrorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  const anyErr = err as { response?: { data?: { message?: unknown } }; message?: unknown };
  const serverMsg = anyErr?.response?.data?.message;
  if (typeof serverMsg === 'string' && serverMsg.trim()) return serverMsg;
  return fallback;
}
