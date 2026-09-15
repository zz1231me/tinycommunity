// client/src/utils/siteIdentityCache.ts
// 사이트 이름·제목·파비콘을 localStorage 에 캐시한다.
//
// 이 값들이 없으면 설정을 받아오기 전까지 코드에 박힌 기본 이름('TinyCommunity')이
// 화면에 보인다. 서버에 닿지 못하면 그 이름이 계속 남는다.
// 한 번이라도 받아온 뒤에는 마지막으로 본 이름을 그대로 쓴다.
//
// 제목·파비콘은 public/site-identity.js 가 첫 페인트 전에 직접 적용하고,
// 이름은 아래 readCachedIdentity 로 store 초기값에 들어간다.

const KEYS = {
  siteName: 'siteName',
  siteTitle: 'siteTitle',
  faviconUrl: 'faviconUrl',
} as const;

export interface CachedIdentity {
  siteName?: string;
  siteTitle?: string;
}

export function cacheSiteIdentity(identity: {
  siteName?: string | null;
  siteTitle?: string | null;
  faviconUrl?: string | null;
}): void {
  try {
    if (identity.siteName) localStorage.setItem(KEYS.siteName, identity.siteName);
    if (identity.siteTitle) localStorage.setItem(KEYS.siteTitle, identity.siteTitle);
    if (identity.faviconUrl) localStorage.setItem(KEYS.faviconUrl, identity.faviconUrl);
    else localStorage.removeItem(KEYS.faviconUrl);
  } catch {
    // localStorage 불가(프라이빗 모드 등) — 캐시 없이 진행
  }
}

/** 마지막으로 받아온 이름. 없으면 빈 객체 — 호출부가 기본값을 쓴다. */
export function readCachedIdentity(): CachedIdentity {
  try {
    const siteName = localStorage.getItem(KEYS.siteName) ?? undefined;
    const siteTitle = localStorage.getItem(KEYS.siteTitle) ?? undefined;
    return { ...(siteName && { siteName }), ...(siteTitle && { siteTitle }) };
  } catch {
    return {};
  }
}
