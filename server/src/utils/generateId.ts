// server/src/utils/generateId.ts
import crypto from 'crypto';

/**
 * 대문자 알파벳과 숫자로만 구성된 랜덤 ID 생성 (crypto.randomBytes 사용)
 * @param length ID 길이 (기본값: 12)
 * @returns 생성된 ID (예: "A3K9M2P7Q1X5")
 */
export function generateRandomId(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // Rejection sampling: 256 % 36 = 4 이므로 단순 모듈러스는 앞 4개 문자에 편향이 생김.
  // 균등 분포를 보장하기 위해 유효 범위(floor * chars.length) 밖의 바이트는 버린다.
  const floor = Math.floor(256 / chars.length) * chars.length; // 252
  let result = '';
  while (result.length < length) {
    const bytes = crypto.randomBytes(length * 2); // 여유 있게 생성
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < floor) {
        result += chars.charAt(bytes[i] % chars.length);
      }
    }
  }
  return result;
}
