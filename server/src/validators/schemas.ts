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

// ─── 댓글 ─────────────────────────────────────────────────
// 길이 상한은 사이트 설정(commentContentMaxLength)에서 오는 동적 값이라 컨트롤러에 남긴다.
// 여기서는 구조(타입·형식)만 확정해 컨트롤러가 값의 모양을 다시 의심하지 않게 한다.

export const createCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.'),
  parentId: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)])
    .nullish(),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.'),
});

// ─── 메모 ─────────────────────────────────────────────────

// memo.controller 의 VALID_COLORS 와 반드시 일치해야 한다
const MEMO_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;

const memoFields = {
  title: z.string().max(200, '제목은 200자를 초과할 수 없습니다.').optional(),
  content: z.string().max(10000, '내용은 10,000자를 초과할 수 없습니다.').optional(),
  color: z
    .enum(MEMO_COLORS, { message: `색상은 ${MEMO_COLORS.join(', ')} 중 하나여야 합니다.` })
    .optional(),
};

export const createMemoSchema = z
  .object(memoFields)
  .refine(v => Boolean(v.title?.trim()) || Boolean(v.content?.trim()), {
    // 제목·내용이 모두 비어 있으면 저장 의미 없음 — 댓글/게시글 검증과 일관
    message: '제목 또는 내용을 입력해주세요.',
    path: ['content'],
  });

// ⚠️ validateBody 는 req.body 를 파싱 결과로 교체하므로, 스키마에 없는 키는 사라진다.
//    수정 요청은 고정·정렬만 바꾸는 경우가 있어 isPinned·order 를 반드시 포함해야 하고,
//    "제목 또는 내용 필수" 규칙도 적용하면 안 된다(고정만 토글하는 요청이 막힌다).
export const updateMemoSchema = z.object({
  ...memoFields,
  isPinned: z.boolean().optional(),
  order: z.number().int().min(0, 'order는 0 이상의 정수여야 합니다.').optional(),
});

// ─── 태그 ─────────────────────────────────────────────────

// tag.controller 의 HEX_COLOR_REGEX 와 동일 — 3자리 축약형(#f00)도 허용한다
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const createTagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '태그 이름은 필수입니다.')
    .max(50, '태그 이름은 50자를 초과할 수 없습니다.'),
  color: z.string().regex(HEX_COLOR, '유효한 HEX 색상 코드를 입력하세요. (예: #3b82f6)').optional(),
  description: z.string().max(500, '태그 설명은 500자를 초과할 수 없습니다.').optional(),
  boardId: z.string().nullish(),
});

export const updateTagSchema = createTagSchema.partial();
