// 인증 쿠키의 Secure 플래그 결정 (auth/twoFactor 컨트롤러 공용)

/**
 * 쿠키 Secure 플래그 여부를 결정한다.
 * COOKIE_SECURE가 명시되면 그 값을 따르고, 없으면 프로덕션에서만 true.
 */
export function isCookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return process.env.NODE_ENV === 'production';
}
