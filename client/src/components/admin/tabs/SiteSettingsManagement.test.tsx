// client/src/components/admin/tabs/SiteSettingsManagement.test.tsx
//
// 설정을 못 불러왔을 때 편집 화면을 열지 않는가.
//
// 예전에는 안내만 띄우고 기본값으로 채운 폼을 그대로 보여 줬다. 관리자는 그 값이 지금 설정인
// 줄 알고 저장을 눌렀고, 그 순간 서버의 진짜 설정(보안 설정까지)이 화면의 기본값으로 덮였다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// 저장 결과는 팝업으로 알린다.
//
// 이 화면은 설정이 많아 저장 단추가 맨 아래에 있다. 안내를 폼 맨 위에 그리면 눌러도
// 아무 일 없는 것처럼 보여서 (글쓰기 화면에서는 안내가 화면 위로 795px 밖이었다)
// 관리자 쪽 다른 화면과 같게 팝업으로 띄운다.
describe('저장 결과 알림', () => {
  const settings = { siteName: '우리 사이트', siteTitle: '우리 사이트' };

  /** 팝업은 React 밖 DOM 에 뜬다. 성공은 오른쪽 위, 오류는 화면 가운데다. */
  const popup = (pattern: RegExp) =>
    waitFor(() => {
      const text =
        (document.getElementById('app-toast-container')?.textContent ?? '') +
        (document.getElementById('app-center-error')?.textContent ?? '');
      expect(text).toMatch(pattern);
    });

  beforeEach(() => {
    document.getElementById('app-toast-container')?.remove();
    document.getElementById('app-center-error')?.remove();
    getAdminSiteSettings.mockResolvedValue(settings);
  });

  /**
   * 저장 단추를 누른다. happy-dom 은 submit 단추 클릭으로 폼 submit 을 올리지 않아
   * 폼에 직접 보낸다 — 단추가 폼 안의 submit 인지는 함께 확인한다.
   */
  const save = async () => {
    const button = (await screen.findByRole('button', {
      name: /설정 저장/,
    })) as HTMLButtonElement;
    expect(button.type).toBe('submit');
    const form = button.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
  };

  it('저장되면 팝업으로 알린다', async () => {
    updateSiteSettings.mockResolvedValue(settings);
    show();

    await save();

    await popup(/설정이 저장되었습니다/);
  });

  it('저장이 실패해도 팝업으로 알린다 — 맨 아래에서 눌러도 보이게', async () => {
    updateSiteSettings.mockRejectedValue(new Error('끊김'));
    show();

    await save();

    await popup(/설정 저장에 실패했습니다/);
  });
});
