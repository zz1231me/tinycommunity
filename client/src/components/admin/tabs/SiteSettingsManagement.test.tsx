// client/src/components/admin/tabs/SiteSettingsManagement.test.tsx
//
// 설정을 못 불러왔을 때 편집 화면을 열지 않는가.
//
// 예전에는 안내만 띄우고 기본값으로 채운 폼을 그대로 보여 줬다. 관리자는 그 값이 지금 설정인
// 줄 알고 저장을 눌렀고, 그 순간 서버의 진짜 설정(보안 설정까지)이 화면의 기본값으로 덮였다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SiteSettingsManagement } from './SiteSettingsManagement';

const show = () =>
  render(
    <MemoryRouter>
      <SiteSettingsManagement />
    </MemoryRouter>
  );

const getAdminSiteSettings = vi.hoisted(() => vi.fn());
const updateSiteSettings = vi.hoisted(() => vi.fn());
vi.mock('../../../api/siteSettings', () => ({
  getAdminSiteSettings,
  updateSiteSettings,
  uploadSiteAsset: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  updateSiteSettings.mockResolvedValue({});
});

describe('설정을 불러오지 못했을 때', () => {
  it('편집 화면 대신 실패를 알린다 — 저장 단추를 주지 않는다', async () => {
    getAdminSiteSettings.mockRejectedValue(new Error('끊김'));

    show();

    expect(await screen.findByText(/설정을 불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /저장/ })).not.toBeInTheDocument();
    expect(updateSiteSettings).not.toHaveBeenCalled();
  });

  it('제대로 불러오면 편집 화면이 열린다 — 대조', async () => {
    getAdminSiteSettings.mockResolvedValue({ siteName: '우리 사이트' });

    show();

    await waitFor(() =>
      expect(screen.queryByText(/설정을 불러오지 못했습니다/)).not.toBeInTheDocument()
    );
    expect(await screen.findByRole('button', { name: /저장/ })).toBeInTheDocument();
  });
});
