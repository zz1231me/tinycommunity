// server/src/types/speakeasy.d.ts - speakeasy 타입 선언
declare module 'speakeasy' {
  interface GenerateSecretOptions {
    name?: string;
    length?: number;
    symbols?: boolean;
    otpauth_url?: boolean;
    google_auth_qr?: boolean;
    issuer?: string;
  }

  interface GeneratedSecret {
    ascii: string;
    hex: string;
    base32: string;
    qr_code_ascii?: string;
    qr_code_hex?: string;
    qr_code_base32?: string;
    google_auth_qr?: string;
    otpauth_url?: string;
  }

  interface VerifyOptions {
    secret: string;
    encoding?: 'ascii' | 'hex' | 'base32';
    token: string;
    window?: number;
    step?: number;
    counter?: number;
    digits?: number;
    algorithm?: 'sha1' | 'sha256' | 'sha512';
  }

  export function generateSecret(options?: GenerateSecretOptions): GeneratedSecret;

  interface TotpOptions {
    secret: string;
    encoding?: 'ascii' | 'hex' | 'base32';
    step?: number;
    digits?: number;
    algorithm?: 'sha1' | 'sha256' | 'sha512';
    time?: number;
  }

  /**
   * ⚠️ 실제 런타임 API 와 일치시켜야 한다.
   *    speakeasy.totp 는 "호출 가능한 함수"이고 verify/verifyDelta 를 프로퍼티로 갖는다.
   *    예전 선언은 namespace + generate() 였는데, generate 는 라이브러리에 존재하지 않아
   *    타입 검사만 통과하고 런타임에 TypeError 가 났다.
   */
  interface Totp {
    (options: TotpOptions): string;
    verify(options: VerifyOptions): boolean;
    verifyDelta(options: VerifyOptions): { delta: number } | undefined;
  }

  export const totp: Totp;
}
