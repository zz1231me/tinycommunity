// 관리자가 기능을 끈 것을 열어 둔 탭이 알아채는지.
//
// 끄기 전에 열어 둔 화면은 메뉴를 그대로 두고, 눌러 보면 "포인트 정보를 불러오지
// 못했습니다. 잠시 후 다시 시도해주세요" 라고 했다. 기다려도 달라지지 않는다 —
// 관리자가 끈 것이기 때문이다. 서버는 code: 'FEATURE_DISABLED' 로 정확히 알려 주는데
// 읽는 자리가 없었다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { applyFeatureSignal } from './featureSignal';
import { useFeatures } from '../store/features';

const mockGet = vi.fn();
vi.mock('./axios', () => ({ default: { get: (url: string) => mockGet(url) } }));

const rejected = (over: Record<string, unknown> = {}) => ({
  response: { status: 403, data: { code: 'FEATURE_DISABLED', ...over } },
});

const features = () => useFeatures.getState().features;

beforeEach(() => {
  vi.clearAllMocks();
  useFeatures.setState({ features: { 'tools.lottery': true }, loaded: true });
  mockGet.mockResolvedValue({ data: { success: true, data: { 'tools.lottery': false } } });
});

describe('applyFeatureSignal', () => {
  it('꺼진 기능을 만나면 스위치 목록을 다시 읽는다', async () => {
    applyFeatureSignal(rejected({ details: { feature: 'tools.lottery' } }));

    await waitFor(() => expect(features()['tools.lottery']).toBe(false));
    expect(mockGet).toHaveBeenCalledWith('/features');
  });

  it('그 사이 다시 켜진 기능도 같이 돌아온다', async () => {
    // 끊긴 것만 꺼 두면 켜진 뒤에도 새로고침할 때까지 숨은 채로 남는다
    useFeatures.setState({
      features: { 'tools.lottery': true, 'tools.memo': false },
      loaded: true,
    });
    mockGet.mockResolvedValue({
      data: { success: true, data: { 'tools.lottery': false, 'tools.memo': true } },
    });

    applyFeatureSignal(rejected());

    await waitFor(() => expect(features()['tools.memo']).toBe(true));
  });

  it('한 화면에서 여러 판이 거절당해도 한 번만 읽는다', async () => {
    applyFeatureSignal(rejected());
    applyFeatureSignal(rejected());
    applyFeatureSignal(rejected());

    await waitFor(() => expect(features()['tools.lottery']).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('다 읽은 뒤에는 다시 읽을 수 있다 — 한 번 쓰고 막히지 않는다', async () => {
    applyFeatureSignal(rejected());
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    applyFeatureSignal(rejected());
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it('평범한 권한 거부는 건드리지 않는다 — 양성 대조', async () => {
    applyFeatureSignal({
      response: { status: 403, data: { message: '이 게시판에 글을 쓸 수 없습니다.' } },
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(features()['tools.lottery']).toBe(true);
  });

  it('다른 상태 코드는 건드리지 않는다', () => {
    applyFeatureSignal({ response: { status: 500, data: { code: 'FEATURE_DISABLED' } } });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('응답이 없는 오류(회선 끊김)에도 터지지 않는다', () => {
    expect(() => applyFeatureSignal({ message: 'Network Error' })).not.toThrow();
    expect(() => applyFeatureSignal(undefined)).not.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
