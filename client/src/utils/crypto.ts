import CryptoJS from 'crypto-js';

// ✅ PBKDF2 반복 횟수 — NIST SP 800-132 권장 최솟값 준수
// ⚠️ 변경 시 기존 암호화 콘텐츠 복호화 불가 (마이그레이션 필요)
const ITERATIONS = 100000;
const KEY_SIZE = 256 / 32; // 256-bit key
const SALT_SIZE = 16;

function deriveKey(password: string, salt: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_SIZE,
    iterations: ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
}

export function encryptContent(
  content: string,
  password: string
): { ciphertext: string; salt: string } {
  const salt = CryptoJS.lib.WordArray.random(SALT_SIZE);
  const key = deriveKey(password, salt);
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(content, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  // Format: iv:ciphertext (both base64)
  const ciphertext =
    iv.toString(CryptoJS.enc.Base64) + ':' + encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  return {
    ciphertext,
    salt: salt.toString(CryptoJS.enc.Base64),
  };
}

export function decryptContent(
  ciphertext: string,
  password: string,
  saltBase64: string
): string | null {
  try {
    const salt = CryptoJS.enc.Base64.parse(saltBase64);
    const key = deriveKey(password, salt);
    const [ivBase64, encryptedBase64] = ciphertext.split(':');
    if (!ivBase64 || !encryptedBase64) return null;
    const iv = CryptoJS.enc.Base64.parse(ivBase64);
    const encryptedHex = CryptoJS.enc.Base64.parse(encryptedBase64);
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: encryptedHex });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (!result) return null;
    return result;
  } catch {
    return null;
  }
}
