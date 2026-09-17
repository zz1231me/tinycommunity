// client/src/api/utils.test.ts
// unwrap 은 모든 API 호출이 통과하는 지점이라, 서버 응답 봉투({success,data})와
// 봉투 없는 응답을 모두 올바르게 벗겨내는지 고정해 둔다.

import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, unwrap } from './utils';

describe('unwrap', () => {
  it('sendSuccess 봉투에서 data 를 꺼낸다', () => {
    expect(unwrap({ data: { success: true, data: { id: 1 } } })).toEqual({ id: 1 });
  });

  it('봉투가 없으면 응답 본문을 그대로 반환', () => {
    expect(unwrap({ data: [1, 2, 3] })).toEqual([1, 2, 3]);
  });

  it('data 가 null 인 봉투도 null 로 벗겨낸다', () => {
    expect(unwrap({ data: { success: true, data: null } })).toBeNull();
  });

  it('본문이 null 이면 null 을 반환(‘data’ 접근으로 터지지 않음)', () => {
    expect(unwrap({ data: null })).toBeNull();
  });

  it('data 키를 가진 일반 객체도 한 겹만 벗긴다', () => {
    // 서버가 { data: { data: ... } } 로 내려주는 경우에도 한 단계만 처리한다.
    expect(unwrap({ data: { data: { data: 'deep' } } })).toEqual({ data: 'deep' });
  });
});

describe('getApiErrorMessage', () => {
  it('서버가 내려준 message 를 우선 사용', () => {
    const err = { response: { data: { message: '권한이 없습니다.' } } };
    expect(getApiErrorMessage(err)).toBe('권한이 없습니다.');
  });

  it('서버 message 가 없으면 fallback', () => {
    expect(getApiErrorMessage(new Error('Network Error'), '기본 메시지')).toBe('기본 메시지');
  });

  it('서버 message 가 공백만이면 fallback', () => {
    const err = { response: { data: { message: '   ' } } };
    expect(getApiErrorMessage(err, '기본 메시지')).toBe('기본 메시지');
  });

  it('message 가 문자열이 아니면 fallback', () => {
    const err = { response: { data: { message: { nested: true } } } };
    expect(getApiErrorMessage(err, '기본 메시지')).toBe('기본 메시지');
  });

  it('null/undefined 에도 터지지 않고 fallback', () => {
    expect(getApiErrorMessage(null)).toBe('요청을 처리하지 못했습니다.');
    expect(getApiErrorMessage(undefined)).toBe('요청을 처리하지 못했습니다.');
  });
});
