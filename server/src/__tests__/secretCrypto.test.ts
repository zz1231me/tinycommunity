import { encryptSecret, decryptSecret } from '../utils/secretCrypto';

// 2FA TOTP 시크릿의 at-rest 암호화 유틸 검증.
// JWT_SECRET은 __tests__/env-setup.ts에서 주입됨.

describe('secretCrypto — 2FA 시크릿 at-rest 암호화', () => {
  const sample = 'JBSWY3DPEHPK3PXP'; // 전형적인 base32 TOTP 시크릿

  it('암호화 후 복호화하면 원문이 복원된다', () => {
    const enc = encryptSecret(sample);
    expect(decryptSecret(enc)).toBe(sample);
  });

  it('암호문은 평문을 포함하지 않고 enc:v1: 접두어를 가진다', () => {
    const enc = encryptSecret(sample);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(enc).not.toContain(sample);
  });

  it('동일 입력도 IV가 달라 매번 다른 암호문을 생성한다(비결정성)', () => {
    expect(encryptSecret(sample)).not.toBe(encryptSecret(sample));
  });

  it('접두어 없는 레거시 평문은 그대로 반환한다(하위호환)', () => {
    expect(decryptSecret(sample)).toBe(sample);
  });

  it('변조된 암호문(auth tag 불일치)은 예외를 던진다', () => {
    const enc = encryptSecret(sample);
    const tampered = enc.slice(0, -2) + (enc.endsWith('00') ? '11' : '00');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('형식이 손상된 암호문은 예외를 던진다', () => {
    expect(() => decryptSecret('enc:v1:onlyonepart')).toThrow();
  });
});
