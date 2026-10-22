// client/src/components/admin/tabs/SiteSettingsManagement.test.tsx
//
// 설정을 못 불러왔을 때 편집 화면을 열지 않는가.
//
// 예전에는 안내만 띄우고 기본값으로 채운 폼을 그대로 보여 줬다. 관리자는 그 값이 지금 설정인
// 줄 알고 저장을 눌렀고, 그 순간 서버의 진짜 설정(보안 설정까지)이 화면의 기본값으로 덮였다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  MAX_EVENT_CATEGORIES: 20,
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

// 설정 묶음.
//
// 구역이 열넷이라 한 줄로 늘어놓으면(실측 12,703px — 19화면) 찾는 값까지 내려가는 것이
// 일이었다. 한 번에 한 묶음만 보여 준다.
//
// 지켜야 하는 선:
//  1. 다른 화면의 '설정 열기' 링크(#lottery 등)가 그 구역이 있는 묶음을 먼저 열어야 한다.
//     안 그러면 구역이 그려지지 않아 스크롤도 강조도 일어나지 않는다 — 눌러도 아무 일 없다.
//  2. 안 보이는 묶음에서 고친 것도 저장된다. 폼 하나에 담긴 같은 설정이기 때문이다.
//  3. 그래서 '저장 안 된 변경' 은 어느 묶음에 있든 보여야 한다.
describe('설정 묶음', () => {
  const full = {
    siteName: '우리 사이트',
    // 둘 다 없으면 handleSubmit 이 '필수입니다' 로 일찍 돌아가 저장이 일어나지 않는다
    siteTitle: '우리 사이트 제목',
    maxLoginAttempts: 5,
    securityLogRetentionDays: 90,
    lotteryPrizes: [],
    eventCategories: [],
  };

  const open = async (hash = '') => {
    getAdminSiteSettings.mockResolvedValue(full);
    render(
      <MemoryRouter initialEntries={[`/admin/site-settings${hash}`]}>
        <SiteSettingsManagement />
      </MemoryRouter>
    );
    await screen.findByRole('button', { name: /설정 저장/ });
  };

  const groupNav = () => screen.getByRole('navigation', { name: '설정 묶음' });
  const current = () =>
    within(groupNav())
      .getAllByRole('button')
      .find(b => b.getAttribute('aria-current') === 'page')?.textContent;

  it('처음에는 사이트 묶음만 보여 준다', async () => {
    await open();
    expect(current()).toBe('사이트');
    expect(screen.getByText('기본 정보')).toBeInTheDocument();
    // 다른 묶음의 구역은 그려지지도 않는다
    expect(screen.queryByText('포인트 뽑기')).toBeNull();
  });

  it.each([
    ['#lottery', '포인트', '포인트 뽑기'],
    ['#tasks', '업무·일정', '업무'],
    ['#file-limits', '파일', '파일 크기 제한 (카테고리별)'],
    ['#editor', '글·댓글', '에디터 설정'],
    ['#event-categories', '업무·일정', '일정'],
    ['#security', '회원·보안', '비밀번호·로그인·토큰'],
    ['#log-retention', '시스템', '로그 보존 기간'],
  ])('%s 로 들어오면 %s 묶음을 열어 그 구역을 보여 준다', async (hash, group, section) => {
    await open(hash);
    expect(current()).toBe(group);
    expect(screen.getByText(section)).toBeInTheDocument();
  });

  it('묶음을 옮기면 그 묶음의 구역으로 바뀐다', async () => {
    await open();
    fireEvent.click(within(groupNav()).getByRole('button', { name: '포인트' }));
    expect(screen.getByText('포인트 뽑기')).toBeInTheDocument();
    expect(screen.queryByText('기본 정보')).toBeNull();
  });

  // 안 보이는 묶음에서 고친 것이 있다는 사실은 늘 보여야 한다.
  it('다른 묶음으로 옮겨도 저장 안 된 변경 표시가 남는다', async () => {
    await open();
    expect(screen.queryByText(/저장하지 않은 변경/)).toBeNull();

    fireEvent.change(screen.getByDisplayValue(full.siteName), { target: { value: '바꾼 이름' } });
    expect(screen.getByText(/저장하지 않은 변경/)).toBeInTheDocument();

    fireEvent.click(within(groupNav()).getByRole('button', { name: '시스템' }));
    expect(screen.queryByText('기본 정보')).toBeNull();
    expect(screen.getByText(/저장하지 않은 변경/)).toBeInTheDocument();
  });

  // 보이지 않는 묶음의 값도 함께 간다. 안 그러면 묶음을 옮긴 순간 편집이 사라진다.
  it('다른 묶음에서 고친 값도 저장에 실려 간다', async () => {
    await open();
    fireEvent.change(screen.getByDisplayValue(full.siteName), { target: { value: '바꾼 이름' } });
    fireEvent.click(within(groupNav()).getByRole('button', { name: '시스템' }));
    // happy-dom 은 단추 클릭으로 submit 을 쏘지 않는다. 폼에 직접 보낸다(위 save 와 같게).
    fireEvent.submit(screen.getByRole('button', { name: /설정 저장/ }).closest('form')!);

    await waitFor(() => expect(updateSiteSettings).toHaveBeenCalled());
    expect(updateSiteSettings.mock.calls[0][0]).toMatchObject({ siteName: '바꾼 이름' });
  });
});
