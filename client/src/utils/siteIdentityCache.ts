// client/src/utils/siteIdentityCache.ts
// 사이트 제목/파비콘을 localStorage에 캐시한다. index.html의 인라인 스크립트가 첫 페인트 전에
// 이 값을 읽어 적용해, 설정 fetch 완료 전까지 기본 title이 깜빡이던 문제를 없앤다.
// 사이트 정체성이 갱신되는 모든 지점(앱 시작 시 설정 로드, 관리자 설정 저장)에서 호출해
// 캐시를 최신으로 유지한다(관리자 변경 후에도 다음 새로고침에서 옛 제목 깜빡임 방지).
export function cacheSiteIdentity(siteTitle?: string | null, faviconUrl?: string | null): void {
  try {
    if (siteTitle) localStorage.setItem('siteTitle', siteTitle);
    if (faviconUrl) localStorage.setItem('faviconUrl', faviconUrl);
    else localStorage.removeItem('faviconUrl');
  } catch {
    // localStorage 불가(프라이빗 모드 등) — 캐시 없이 진행
  }
}
