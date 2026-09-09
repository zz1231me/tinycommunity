// server/src/utils/secretCrypto.ts
// 민감한 비밀값(현재 2FA TOTP 시크릿)을 DB에 저장하기 전 암호화하는 유틸.
// API 응답에는 노출되지 않지만(toJSON에서 strip), DB 유출 시 평문 TOTP 시크릿이 그대로
// 새어 2차 인증이 무력화되는 것을 막기 위한 at-rest 방어 계층이다.
//
// 키는 이미 필수·강제 검증되는 JWT_SECRET에서 HKDF로 파생한다(새 env 변수 불필요).
// 저장 포맷: `enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>` — 접두어로 암호문 여부를 판별해
// 과거 평문(접두어 없음)도 그대로 복호화 단계에서 통과시켜 하위호환을 유지한다.

import crypto from 'crypto';
import { env } from '../config/env';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 권장 96bit
const KEY_LENGTH = 32; // AES-256

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  // HKDF-SHA256으로 JWT_SECRET에서 32바이트 키 파생 (앱 고정 salt/info로 도메인 분리)
  const derived = crypto.hkdfSync(
    'sha256',
    Buffer.from(env.JWT_SECRET, 'utf8'),
    Buffer.from('jamtori-2fa-secret-salt', 'utf8'),
    Buffer.from('2fa-secret-encryption', 'utf8'),
    KEY_LENGTH
  );
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

/** 평문 비밀값을 암호화해 저장용 문자열로 변환한다. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * 저장된 값을 복호화한다. 암호문 접두어가 없으면 과거 평문으로 간주하고 그대로 반환한다.
 * 형식이 손상됐거나 복호화에 실패하면 예외를 던진다(무결성 검증).
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // 레거시 평문 하위호환

  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('암호화된 비밀값 형식이 올바르지 않습니다.');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
  return plain.toString('utf8');
}
