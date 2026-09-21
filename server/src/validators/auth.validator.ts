import { getMinPasswordLength, getPasswordComplexityRules } from '../utils/settingsCache';

/** bcrypt 가 실제로 보는 최대 길이(바이트). 이 뒤는 해시에 반영되지 않는다. */
const MAX_PASSWORD_BYTES = 72;

export class AuthValidator {
  // 자가 회원가입용 — 영문/숫자/언더스코어, 4~20자
  static validateUserId(id: string): { valid: boolean; error?: string } {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: '아이디는 필수입니다.' };
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(id)) {
      return {
        valid: false,
        error: '아이디는 영문, 숫자, 언더스코어(_)만 사용 가능하며 4~20자여야 합니다.',
      };
    }
    return { valid: true };
  }

  // 관리자 직접 생성용 — 한글/영문/숫자/./@/-/_ 허용, 1~30자, 공백 불허
  static validateAdminUserId(id: string): { valid: boolean; error?: string } {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: '아이디는 필수입니다.' };
    }
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: '아이디는 필수입니다.' };
    }
    if (trimmed.length > 30) {
      return { valid: false, error: '아이디는 30자 이내여야 합니다.' };
    }
    if (/\s/.test(trimmed)) {
      return { valid: false, error: '아이디에 공백을 포함할 수 없습니다.' };
    }
    if (!/^[a-zA-Z0-9가-힣._\-]+$/.test(trimmed)) {
      return { valid: false, error: '아이디에 사용할 수 없는 특수문자가 포함되어 있습니다.' };
    }
    return { valid: true };
  }

  /**
   * 비밀번호 유효성 검사
   * @param password 검사할 비밀번호
   * @param requireComplexity true이면 대문자 + 소문자 + 숫자/특수문자 조합 필수
   */
  static validatePassword(
    password: string,
    requireComplexity = false
  ): { valid: boolean; error?: string } {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: '비밀번호는 필수입니다.' };
    }
    // bcrypt 는 72바이트를 넘는 부분을 버리므로 글자 수가 아니라 바이트로 센다.
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      return {
        valid: false,
        error: `비밀번호가 너무 깁니다. (한글은 ${Math.floor(MAX_PASSWORD_BYTES / 3)}자, 영문은 ${MAX_PASSWORD_BYTES}자까지)`,
      };
    }
    const minLength = getMinPasswordLength();
    if (password.length < minLength) {
      return { valid: false, error: `비밀번호는 최소 ${minLength}자 이상이어야 합니다.` };
    }
    if (requireComplexity) {
      const rules = getPasswordComplexityRules();
      if (rules.requireUppercase && !/[A-Z]/.test(password)) {
        return { valid: false, error: '비밀번호는 영문 대문자를 포함해야 합니다.' };
      }
      if (rules.requireLowercase && !/[a-z]/.test(password)) {
        return { valid: false, error: '비밀번호는 영문 소문자를 포함해야 합니다.' };
      }
      if (rules.requireNumberOrSpecial && !/[0-9!@#$%^&*]/.test(password)) {
        return {
          valid: false,
          error: '비밀번호는 숫자 또는 특수문자(!@#$%^&*)를 포함해야 합니다.',
        };
      }
    }
    return { valid: true };
  }

  static validateName(name: string): { valid: boolean; error?: string } {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return { valid: false, error: '이름은 필수입니다.' };
    }
    if (name.trim().length > 50) {
      return { valid: false, error: '이름은 50자 이내여야 합니다.' };
    }
    return { valid: true };
  }

  static validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email) return { valid: true }; // 선택 필드
    // User.email 은 STRING(100) 이라 넘기면 모델 검증기에서 걸린다.
    if (email.length > 100) {
      return { valid: false, error: '이메일은 100자를 초과할 수 없습니다.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { valid: false, error: '유효한 이메일 형식이 아닙니다.' };
    }
    return { valid: true };
  }
}
