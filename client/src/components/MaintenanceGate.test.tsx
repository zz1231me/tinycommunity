// 점검 안내 화면이 스스로 풀리는지.
//
// 설정은 앱이 시작할 때 한 번만 읽는다. 점검이 켜지는 쪽은 503 으로 알게 되지만
// (api/maintenanceSignal.ts) 끝나는 쪽은 알려 주는 것이 없어, 점검이 끝나도 새로고침할
// 때까지 안내 화면에 갇혀 있었다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MaintenanceGate } from './MaintenanceGate';
import { DEFAULT_SETTINGS, useSiteSettings } from '../store/siteSettings';

const mockGetSiteSettings = vi.fn();
vi.mock('../api/siteSettings', () => ({
  getSiteSettings: () => mockGetSiteSettings(),
}));

let role = 'user';
vi.mock('../store/auth', () => ({
  useAuth: () => ({ isAuthenticated: true, getUserRole: () => role }),
}));

const show = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <MaintenanceGate>
        <div>평소 화면</div>
      </MaintenanceGate>
    </MemoryRouter>
  );

/** 안내 화면의 제목. 기본 안내 문구에도 '점검 중' 이 들어가므로 역할로 집어 고른다. */
const gate = () => screen.queryByRole('heading', { name: /점검 중/ });

/** 다시 물어보는 차례를 한 번 넘긴다 */
const tick = async () => {
  await act(async () => {
    vi.advanceTimersByTime(60_000);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  role = 'user';
  mockGetSiteSettings.mockReset();
  useSiteSettings.setState({
    settings: { ...DEFAULT_SETTINGS, maintenanceMode: true, maintenanceMessage: '19시에 엽니다.' },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('점검 안내 화면', () => {
  it('점검 중이면 일반 사용자에게 안내와 문구를 보여 준다', () => {
    show();
    expect(gate()).toBeInTheDocument();
    expect(screen.getByText('19시에 엽니다.')).toBeInTheDocument();
    expect(screen.queryByText('평소 화면')).not.toBeInTheDocument();
  });

  it('점검이 끝나면 새로고침 없이 돌아온다', async () => {
    mockGetSiteSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, maintenanceMode: false });
    show();
    expect(screen.queryByText('평소 화면')).not.toBeInTheDocument();

    await tick();

    expect(screen.getByText('평소 화면')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /점검 중/ })).not.toBeInTheDocument();
  });

  it('아직 점검 중이면 안내 화면을 그대로 둔다 — 양성 대조', async () => {
    mockGetSiteSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, maintenanceMode: true });
    show();
    await tick();
    expect(gate()).toBeInTheDocument();
  });

  it('다시 묻다가 실패해도 계속 묻는다', async () => {
    mockGetSiteSettings.mockRejectedValue(new Error('503'));
    show();
    await tick();
    await tick();
    expect(mockGetSiteSettings).toHaveBeenCalledTimes(2);
    expect(gate()).toBeInTheDocument();
  });

  it('점검이 아니면 묻지 않는다', async () => {
    useSiteSettings.setState({ settings: { ...DEFAULT_SETTINGS, maintenanceMode: false } });
    show();
    await tick();
    expect(mockGetSiteSettings).not.toHaveBeenCalled();
    expect(screen.getByText('평소 화면')).toBeInTheDocument();
  });

  it('관리자는 그대로 쓰므로 묻지 않는다', async () => {
    role = 'admin';
    show();
    await tick();
    expect(mockGetSiteSettings).not.toHaveBeenCalled();
    expect(screen.getByText('평소 화면')).toBeInTheDocument();
    expect(screen.getByText(/점검 모드가 켜져 있습니다/)).toBeInTheDocument();
  });

  it('매니저도 그대로 쓴다 — 서버가 통과시키는 역할과 같아야 한다', async () => {
    role = 'manager';
    show();
    await tick();
    expect(mockGetSiteSettings).not.toHaveBeenCalled();
    expect(screen.getByText('평소 화면')).toBeInTheDocument();
    expect(screen.getByText(/점검 모드가 켜져 있습니다/)).toBeInTheDocument();
  });

  it('보고 있지 않은 탭에서는 묻지 않는다', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    show();
    await tick();
    expect(mockGetSiteSettings).not.toHaveBeenCalled();
    hidden.mockRestore();
  });
});
