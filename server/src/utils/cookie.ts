// server/src/utils/cookie.ts
// 인증 쿠키의 Secure 플래그 결정 로직 (auth/twoFactor 컨트롤러 공용)

/**
 * 쿠키 Secure 플래그 여부를 결정한다.
 * - COOKIE_SECURE가 명시적으로 설정되면 그 값을 따른다 (HTTP 인트라넷은 'false' 명시).
 * - 미설정 시: 프로덕션은 안전하게 기본 true, 그 외 환경은 false.
 *   → 외부(HTTPS) 배포에서 설정을 깜빡해도 쿠키가 평문 전송되지 않도록 secure-by-default.
 */
export function isCookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}
