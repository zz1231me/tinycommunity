// 사이트 이름·제목·파비콘을 localStorage 에 캐시해 설정 로드 전에도 마지막 값을 쓴다.

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
    // localStorage 를 쓸 수 없으면 캐시 없이 진행한다
  }
}

/** 마지막으로 받아온 이름. 없으면 빈 객체를 돌려주고 호출부가 기본값을 쓴다. */
export function readCachedIdentity(): CachedIdentity {
  try {
    const siteName = localStorage.getItem(KEYS.siteName) ?? undefined;
    const siteTitle = localStorage.getItem(KEYS.siteTitle) ?? undefined;
    return { ...(siteName && { siteName }), ...(siteTitle && { siteTitle }) };
  } catch {
    return {};
  }
}
