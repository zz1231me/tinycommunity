// zod 스키마. 비밀번호 길이·복잡도는 관리자 설정에 따라 달라지므로 컨트롤러에서 검사한다.

import { z } from 'zod';
import { DUEL_HANDS, DUEL_MESSAGE_MAX, DUEL_STAKE_HARD_MAX, DUEL_TAUNT_MAX } from '../config/duel';
import { ATTACK_KINDS } from '../config/attendanceAttack';

export const loginSchema = z.object({
  id: z.string().min(1, '아이디는 필수입니다.').max(30),
  password: z.string().min(1, '비밀번호는 필수입니다.').max(100),
  // 로그인 기록에 남길 기기 식별값. null 도 받아 없음으로 처리한다.
  fingerprint: z
    .string()
    .max(200)
    .nullish()
    .transform(v => v ?? undefined),
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
  // User.email 은 STRING(100). 상한이 없으면 모델 검증기에서 걸려 500 이 된다.
  email: z
    .string()
    .max(100, '이메일은 100자를 초과할 수 없습니다.')
    .email('유효한 이메일 형식이 아닙니다.')
    .optional()
    .or(z.literal('')),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호는 필수입니다.'),
  // 길이/복잡도 검사는 changePassword 컨트롤러에서 AuthValidator.validatePassword()로 처리
  newPassword: z.string().min(1, '새 비밀번호는 필수입니다.').max(100),
});

export const passwordResetRequestSchema = z.object({
  loginId: z.string().min(1, '아이디를 입력해주세요.').max(50),
});

// 인증번호(6자리) 기반 재설정. 복잡도 검사는 컨트롤러에서 처리한다.
export const passwordResetVerifySchema = z.object({
  loginId: z.string().min(1, '아이디를 입력해주세요.').max(50),
  code: z.string().regex(/^\d{6}$/, '인증번호는 6자리 숫자입니다.'),
  password: z.string().min(1, '새 비밀번호는 필수입니다.').max(100),
});

// 길이 상한은 사이트 설정에서 오는 동적 값이라 컨트롤러에서 검사한다.
// 여기 상한은 태그만 반복해 0자로 세어지는 입력을 막는 구조적 하한선이며, 모델 len 과 같은 값이다.
const COMMENT_MAX = 100000;

export const createCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.').max(COMMENT_MAX),
  // INTEGER 컬럼 범위. 문자열 분기는 변환 뒤에도 상한을 다시 확인한다.
  parentId: z
    .union([
      z.number().int().positive().max(2147483647),
      z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .refine(
          n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647,
          '잘못된 부모 댓글 ID 입니다.'
        ),
    ])
    .nullish(),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.').max(COMMENT_MAX),
});

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
    message: '제목 또는 내용을 입력해주세요.',
    path: ['content'],
  });

// validateBody 가 req.body 를 파싱 결과로 교체하므로 스키마에 없는 키는 사라진다.
// 고정만 토글하는 요청 때문에 isPinned·order 를 포함하고 "제목 또는 내용 필수" 는 걸지 않는다.
export const updateMemoSchema = z.object({
  ...memoFields,
  isPinned: z.boolean().optional(),
  order: z.number().int().min(0, 'order는 0 이상의 정수여야 합니다.').max(2147483647).optional(),
});

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
  boardId: z.string().max(50, '게시판 ID는 50자를 초과할 수 없습니다.').nullish(),
});

export const updateTagSchema = createTagSchema.partial();

export const duelCreateSchema = z.object({
  opponentId: z.string().trim().min(1, '상대를 골라주세요.').max(50),
  // 여기서는 절대 상한만 막는다. 관리자가 정한 범위는 duel.service.create 가 검사한다.
  stake: z
    .number()
    .int('건 포인트는 정수여야 합니다.')
    .min(1, '1P 이상을 걸어주세요.')
    .max(DUEL_STAKE_HARD_MAX),
  hand: z.enum(DUEL_HANDS),
  message: z
    .string()
    .trim()
    .max(DUEL_MESSAGE_MAX, `신청 메시지는 ${DUEL_MESSAGE_MAX}자까지입니다.`)
    .optional(),
});

export const duelAcceptSchema = z.object({
  hand: z.enum(DUEL_HANDS),
});

export const duelTauntSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, '한마디를 입력해주세요.')
    .max(DUEL_TAUNT_MAX, `한마디는 ${DUEL_TAUNT_MAX}자까지입니다.`),
});

export const attendanceAttackSchema = z.object({
  targetId: z.string().trim().min(1, '대상을 골라주세요.').max(50),
  kind: z.enum(ATTACK_KINDS).optional(),
});

export const attendanceCheckInSchema = z.object({
  responses: z
    .array(z.object({ itemId: z.number().int().min(1).max(2147483647), checked: z.boolean() }))
    .max(100, '확인 항목이 너무 많습니다.')
    .optional()
    .default([]),
  note: z.string().max(500, '메모는 500자를 초과할 수 없습니다.').optional(),
});

export const attendanceChecklistCreateSchema = z.object({
  label: z.string().trim().min(1, '항목 내용을 입력해주세요.').max(200),
  description: z.string().max(500).optional(),
  required: z.boolean().optional(),
});

export const attendanceChecklistUpdateSchema = z.object({
  label: z.string().trim().min(1, '항목 내용을 입력해주세요.').max(200).optional(),
  description: z.string().max(500).optional(),
  required: z.boolean().optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).max(2147483647).optional(),
});

// 관리자가 바꿀 수 있는 근무 설정 목록은 여기 한 곳이다. z.object 는 없는 키를 버리므로 필드를 추가하면 여기에도 넣어야 한다.
export const attendancePolicySchema = z.object({
  standardWorkMinutes: z.number().int().min(30).max(1440).optional(),
  // 상한은 서비스(updatePolicy)와 같은 값이다.
  checkInGraceMinutes: z.number().int().min(0).max(60).optional(),
  requireChecklist: z.boolean().optional(),
  noticeText: z.string().max(300, '안내 문구는 300자를 넘을 수 없습니다.').optional(),
});

export const attendanceReorderSchema = z.object({
  ids: z
    .array(z.number().int().min(1).max(2147483647))
    .min(1, '순서를 지정할 항목이 없습니다.')
    .max(100),
});
