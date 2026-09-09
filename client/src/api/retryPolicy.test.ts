// client/src/api/retryPolicy.test.ts
// 재시도 정책은 눈에 잘 띄지 않는데 영향이 크다 — 401 을 재시도하면 axios 인터셉터의
// redirectToLogin() 이 재시도 횟수만큼 반복 실행된다.

import { describe, expect, it } from 'vitest';
import { shouldRetryQuery } from './retryPolicy';

const httpError = (status: number) => ({ response: { status } });

describe('shouldRetryQuery', () => {
  it('401 은 재시도하지 않는다 (하드 리다이렉트 중복 방지)', () => {
    expect(shouldRetryQuery(0, httpError(401))).toBe(false);
  });

  it('403·404 도 재시도하지 않는다 (다시 물어도 답이 같다)', () => {
    expect(shouldRetryQuery(0, httpError(403))).toBe(false);
    expect(shouldRetryQuery(0, httpError(404))).toBe(false);
  });

  it('429 도 4xx 이므로 재시도하지 않는다', () => {
    expect(shouldRetryQuery(0, httpError(429))).toBe(false);
  });

  it('5xx 는 두 번까지 재시도한다', () => {
    expect(shouldRetryQuery(0, httpError(500))).toBe(true);
    expect(shouldRetryQuery(1, httpError(500))).toBe(true);
    expect(shouldRetryQuery(2, httpError(500))).toBe(false);
  });

  it('네트워크 오류(response 없음)도 두 번까지 재시도한다', () => {
    const networkError = new Error('Network Error');
    expect(shouldRetryQuery(0, networkError)).toBe(true);
    expect(shouldRetryQuery(2, networkError)).toBe(false);
  });

  it('알 수 없는 형태의 오류에도 터지지 않는다', () => {
    expect(shouldRetryQuery(0, null)).toBe(true);
    expect(shouldRetryQuery(0, undefined)).toBe(true);
    expect(shouldRetryQuery(0, 'string error')).toBe(true);
  });
});
