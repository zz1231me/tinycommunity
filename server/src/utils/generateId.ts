import crypto from 'crypto';

/**
 * 대문자 알파벳과 숫자로만 구성된 랜덤 ID 생성
 * @param length ID 길이 (기본값: 12)
 * @returns 생성된 ID (예: "A3K9M2P7Q1X5")
 */
export function generateRandomId(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // 256 % 36 = 4 라 단순 모듈러스는 편향이 생긴다. 유효 범위 밖의 바이트는 버린다.
  const floor = Math.floor(256 / chars.length) * chars.length; // 252
  let result = '';
  while (result.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < floor) {
        result += chars.charAt(bytes[i] % chars.length);
      }
    }
  }
  return result;
}
