// 점검 모드가 켜진 것을 열어 둔 탭이 알아채는지.
//
// 켜기 전에 열어 둔 화면은 평소와 똑같이 보이면서 누르는 것마다 조용히 실패했다.
// 서버는 503 에 maintenanceMode: true 를 실어 보내는데 그것을 읽는 쪽이 없었다.

import { beforeEach, describe, expect, it } from 'vitest';
import { applyMaintenanceSignal } from './maintenanceSignal';
import { DEFAULT_SETTINGS, useSiteSettings } from '../store/siteSettings';

const err = (status: number, data: unknown) => ({ response: { status, data } });
const state = () => useSiteSettings.getState().settings;

beforeEach(() => {
  useSiteSettings.setState({ settings: { ...DEFAULT_SETTINGS } });
});

describe('applyMaintenanceSignal', () => {
  it('503 + maintenanceMode 면 화면을 점검 상태로 돌린다', () => {
    applyMaintenanceSignal(
      err(503, { success: false, message: '19시에 다시 열립니다.', maintenanceMode: true })
    );
    expect(state().maintenanceMode).toBe(true);
  });

  it('서버가 적어 보낸 안내 문구를 쓴다', () => {
    applyMaintenanceSignal(err(503, { message: '19시에 다시 열립니다.', maintenanceMode: true }));
    expect(state().maintenanceMessage).toBe('19시에 다시 열립니다.');
  });

  it('문구가 없으면 기존 문구를 지우지 않는다', () => {
    useSiteSettings.setState({
      settings: { ...DEFAULT_SETTINGS, maintenanceMessage: '먼저 받아 둔 안내' },
    });
    applyMaintenanceSignal(err(503, { maintenanceMode: true }));
    expect(state().maintenanceMode).toBe(true);
    expect(state().maintenanceMessage).toBe('먼저 받아 둔 안내');
  });

  it('점검과 무관한 503 은 건드리지 않는다 — 양성 대조', () => {
    applyMaintenanceSignal(err(503, { success: false, message: '잠시 뒤 다시 시도해주세요.' }));
    expect(state().maintenanceMode).toBe(false);
  });

  it('다른 상태 코드는 건드리지 않는다', () => {
    // 본문이 그럴듯해도 503 이 아니면 점검이 아니다
    applyMaintenanceSignal(err(500, { maintenanceMode: true }));
    expect(state().maintenanceMode).toBe(false);
  });

  it('응답이 없는 오류(회선 끊김)에도 터지지 않는다', () => {
    expect(() => applyMaintenanceSignal({ message: 'Network Error' })).not.toThrow();
    expect(() => applyMaintenanceSignal(undefined)).not.toThrow();
    expect(state().maintenanceMode).toBe(false);
  });

  it('이미 점검 중으로 알고 있으면 스토어를 다시 흔들지 않는다', () => {
    // 503 은 요청마다 온다. 매번 쓰면 화면 전체가 그만큼 다시 그려진다.
    useSiteSettings.setState({ settings: { ...DEFAULT_SETTINGS, maintenanceMode: true } });
    const before = state();
    applyMaintenanceSignal(err(503, { message: '바뀐 문구', maintenanceMode: true }));
    expect(state()).toBe(before);
  });
});
