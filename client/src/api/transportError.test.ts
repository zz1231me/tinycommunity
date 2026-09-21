// 서버가 꺼졌거나 회선이 끊겼을 때, 한국어 화면에 axios 의 영어 원문이 그대로 뜨던 자리.
// 로그인 화면은 그 위에 "아이디 또는 비밀번호가 올바르지 않습니다" 로 원인까지 잘못 짚었다.
import { describe, it, expect } from 'vitest';
import {
  localizeTransportError,
  isFetchNetworkError,
  messageFor,
  CONNECT_FAILED,
  TIMED_OUT,
} from './transportError';

describe('localizeTransportError', () => {
  it('응답을 못 받은 오류는 한국어로 바꾼다', () => {
    const err = { message: 'Network Error', code: 'ERR_NETWORK' };
    localizeTransportError(err);
    expect(err.message).toBe(CONNECT_FAILED);
  });

  it('시간 초과는 시간 초과라고 알린다', () => {
    const err = { message: 'timeout of 30000ms exceeded', code: 'ECONNABORTED' };
    localizeTransportError(err);
    expect(err.message).toBe(TIMED_OUT);
  });

  it('서버가 준 메시지는 건드리지 않는다', () => {
    const err = {
      message: 'Request failed with status code 500',
      response: { status: 500, data: { message: '서버 오류가 발생했습니다.' } },
    };
    localizeTransportError(err);
    expect(err.message).toBe('Request failed with status code 500');
  });

  it('취소는 그대로 둔다 — 재시도 판정에 쓰인다', () => {
    const err = { message: 'canceled', code: 'ERR_CANCELED' };
    localizeTransportError(err);
    expect(err.message).toBe('canceled');
  });

  it('오류가 아닌 값에도 터지지 않는다', () => {
    expect(() => localizeTransportError(null)).not.toThrow();
    expect(() => localizeTransportError('그냥 문자열')).not.toThrow();
  });
});

describe('isFetchNetworkError', () => {
  it('fetch 의 회선 오류를 알아본다', () => {
    expect(isFetchNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('서버가 돌려준 오류는 아니라고 답한다', () => {
    expect(isFetchNetworkError(new Error('아이디 또는 비밀번호가 올바르지 않습니다.'))).toBe(false);
  });
});

describe('messageFor', () => {
  it('회선이 끊겼을 때는 비밀번호 탓으로 돌리지 않는다', () => {
    expect(
      messageFor(new TypeError('Failed to fetch'), '아이디 또는 비밀번호가 올바르지 않습니다.')
    ).toBe(CONNECT_FAILED);
  });

  it('서버가 준 이유는 그대로 전한다', () => {
    expect(messageFor(new Error('승인 대기 중인 계정입니다.'), '기본 문구')).toBe(
      '승인 대기 중인 계정입니다.'
    );
  });

  it('오류가 아니면 기본 문구를 쓴다', () => {
    expect(messageFor('이상한 값', '기본 문구')).toBe('기본 문구');
  });
});
