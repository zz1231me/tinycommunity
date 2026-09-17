// client/src/store/features.test.ts
// 기능 스위치를 화면에서 어떻게 해석하는가.
//
// 여기서 가장 중요한 것은 "모를 때는 숨기지 않는다" 이다.
// 설정 조회가 실패했다고 멀쩡한 기능이 사라져 보이면, 사용자는 기능이 없어진 줄 안다.
// 잘못 보여 줘 봐야 눌렀을 때 서버가 403 으로 막는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFeature, useFeatures } from './features';

const mockGet = vi.fn();
vi.mock('../api/axios', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useFeatures.setState({ features: {}, loaded: false });
});

describe('불러오기', () => {
  it('서버가 준 값을 그대로 담는다', async () => {
    mockGet.mockResolvedValue({ data: { data: { 'post.like': false, 'post.scrap': true } } });

    await useFeatures.getState().load();

    expect(useFeatures.getState().features).toEqual({ 'post.like': false, 'post.scrap': true });
    expect(useFeatures.getState().loaded).toBe(true);
  });

  it('조회에 실패해도 던지지 않고 빈 상태로 끝낸다', async () => {
    mockGet.mockRejectedValue(new Error('network'));

    await expect(useFeatures.getState().load()).resolves.toBeUndefined();
    expect(useFeatures.getState().loaded).toBe(true);
  });
});

describe('useFeature 판정', () => {
  it('false 로 내려온 기능만 숨긴다', () => {
    useFeatures.setState({ features: { 'post.like': false }, loaded: true });
    expect(renderHook(() => useFeature('post.like')).result.current).toBe(false);
  });

  it('true 로 내려온 기능은 보여 준다', () => {
    useFeatures.setState({ features: { 'post.like': true }, loaded: true });
    expect(renderHook(() => useFeature('post.like')).result.current).toBe(true);
  });

  it('아직 불러오기 전에는 숨기지 않는다', () => {
    expect(renderHook(() => useFeature('post.like')).result.current).toBe(true);
  });

  it('조회 실패 후에도 숨기지 않는다', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    await useFeatures.getState().load();
    expect(renderHook(() => useFeature('post.scrap')).result.current).toBe(true);
  });

  it('목록에 없는 키는 켜진 것으로 본다', () => {
    useFeatures.setState({ features: { 'post.like': false }, loaded: true });
    expect(renderHook(() => useFeature('tools.wiki')).result.current).toBe(true);
  });
});

describe('저장 직후 반영', () => {
  it('set 하면 곧바로 판정이 바뀐다', () => {
    useFeatures.setState({ features: { 'tools.memo': true }, loaded: true });
    useFeatures.getState().set({ 'tools.memo': false });
    expect(renderHook(() => useFeature('tools.memo')).result.current).toBe(false);
  });
});
