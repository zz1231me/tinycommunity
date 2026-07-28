// server/src/validators/schemas.ts
// zod 스키마 정의 — 주요 API 입력값 검증에 사용
// ⚠️ 비밀번호 최소 길이는 관리자 설정(minPasswordLength)에 따라 동적으로 결정되므로
//    Zod 스키마에서는 구조(non-empty) 검사만 수행하고 실제 길이/복잡도 검사는 컨트롤러에서 처리

import { z } from 'zod';

// ─── 인증 ─────────────────────────────────────────────────

export const loginSchema = z.object({
  id: z.string().min(1, '아이디는 필수입니다.').max(30),
  password: z.string().min(1, '비밀번호는 필수입니다.').max(100),
});

export const registerSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{4,20}$/,
      '아이디는 영문, 숫자, 언더스코어만 사용 가능하며 4~20자여야 합니다.'
    ),
  // 길이/복잡도 검사는 register 컨트롤러에서 AuthValidator.validatePassword()로 처리
  password: z.string().min(1, '비밀번호는 필수입니다.').max(100),
  name: z.string().min(1, '이름은 필수입니다.').max(50).trim(),
  email: z.string().email('유효한 이메일 형식이 아닙니다.').optional().or(z.literal('')),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호는 필수입니다.'),
  // 길이/복잡도 검사는 changePassword 컨트롤러에서 AuthValidator.validatePassword()로 처리
  newPassword: z.string().min(1, '새 비밀번호는 필수입니다.').max(100),
});

export const passwordResetRequestSchema = z.object({
  loginId: z.string().min(1, '아이디를 입력해주세요.').max(50),
});

// 인증번호(6자리) 기반 재설정 — 아이디 + 인증번호 + 새 비밀번호.
// 복잡도 검사는 컨트롤러에서 AuthValidator.validatePassword()로 처리.
export const passwordResetVerifySchema = z.object({
  loginId: z.string().min(1, '아이디를 입력해주세요.').max(50),
  code: z.string().regex(/^\d{6}$/, '인증번호는 6자리 숫자입니다.'),
  password: z.string().min(1, '새 비밀번호는 필수입니다.').max(100),
});
