// client/src/store/siteSettings.test.ts
// 사이트 이름은 관리자가 정한 값이다. 설정을 받아오기 전이나 서버에 못 닿을 때
// 코드에 박힌 기본 이름이 보이면, 관리자가 바꾼 이름이 없던 일이 된다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// setup.ts 가 localStorage 를 통째로 mock 으로 갈아 두었다 — 값을 여기서 직접 먹인다
const getItem = window.localStorage.getItem as ReturnType<typeof vi.fn>;

function cached(values: Record<string, string>) {
  getItem.mockImplementation((key: string) => values[key] ?? null);
}

async function loadStore() {
  vi.resetModules();
  const { useSiteSettings } = await import('./siteSettings');
  return useSiteSettings.getState();
}

beforeEach(() => {
  getItem.mockReset();
  getItem.mockReturnValue(null);
});

describe('사이트 이름 초기값', () => {
  it('한 번 받아 둔 이름이 있으면 그 이름으로 시작한다', async () => {
    cached({ siteName: '우리회사 인트라넷', siteTitle: '우리회사' });

    const state = await loadStore();
    expect(state.settings.siteName).toBe('우리회사 인트라넷');
    expect(state.settings.siteTitle).toBe('우리회사');
    // 서버에서 받은 것은 아니다 — 화면은 이 값을 쓰되 갱신은 계속 기다린다
    expect(state.isLoadedFromServer).toBe(false);
  });

  it('받아 둔 것이 없으면 기본 이름을 쓴다', async () => {
    const state = await loadStore();
    expect(state.settings.siteName).toBe('TinyCommunity');
  });

  it('localStorage 를 못 쓰는 환경에서도 뜬다', async () => {
    getItem.mockImplementation(() => {
      throw new Error('denied');
    });
    const state = await loadStore();
    expect(state.settings.siteName).toBe('TinyCommunity');
  });
});

describe('서버 값이 오면', () => {
  it('받아 둔 이름을 덮어쓴다', async () => {
    cached({ siteName: '옛 이름' });
    vi.resetModules();
    const { useSiteSettings, DEFAULT_SETTINGS } = await import('./siteSettings');
    expect(useSiteSettings.getState().settings.siteName).toBe('옛 이름');

    useSiteSettings.getState().setSettings({ ...DEFAULT_SETTINGS, siteName: '새 이름' });
    expect(useSiteSettings.getState().settings.siteName).toBe('새 이름');
    expect(useSiteSettings.getState().isLoadedFromServer).toBe(true);
  });
});
