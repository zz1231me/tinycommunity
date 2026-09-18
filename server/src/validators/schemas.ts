// server/src/validators/schemas.ts
// zod 스키마 정의 — 주요 API 입력값 검증에 사용
// ⚠️ 비밀번호 최소 길이는 관리자 설정(minPasswordLength)에 따라 동적으로 결정되므로
//    Zod 스키마에서는 구조(non-empty) 검사만 수행하고 실제 길이/복잡도 검사는 컨트롤러에서 처리

import { z } from 'zod';
import { DUEL_HANDS, DUEL_STAKE_HARD_MAX } from '../config/duel';
import { ATTACK_KINDS } from '../config/attendanceAttack';

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
  // User.email 컬럼이 STRING(100) 이다. 상한이 없으면 모델 검증기까지 내려가
  // SequelizeValidationError 가 되고, 그것이 500 으로 나간다.
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

// 구조적 상한. 컨트롤러의 길이 검사는 태그를 걷어낸 '글자 수' 를 세므로, 빈 태그를
// 수만 번 반복하면 0자로 세어져 그대로 통과한다. 모델의 len [1, 100000] 과 같은 값으로
// 막아 둔다 — 동적 상한을 대신하는 것이 아니라 그 밑을 받치는 것이다.
const COMMENT_MAX = 100000;

export const createCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.').max(COMMENT_MAX),
  // INTEGER 컬럼이라 범위를 넘기면 방언에 따라 DB 오류가 된다.
  // 문자열 분기는 Number 로 바뀌므로 변환 뒤에도 상한을 다시 본다.
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
  order: z.number().int().min(0, 'order는 0 이상의 정수여야 합니다.').max(2147483647).optional(),
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
  boardId: z.string().max(50, '게시판 ID는 50자를 초과할 수 없습니다.').nullish(),
});

export const updateTagSchema = createTagSchema.partial();

// ─── 출퇴근 ───────────────────────────────────────────────

/**
 * 포인트 대결 신청.
 *
 * 금액 범위는 config/duel 의 규칙과 같은 값을 쓴다 — 여기서만 막고 서비스에서
 * 안 막으면 API 를 직접 부르는 쪽에 제약이 없고, 두 곳에 숫자를 따로 적어 두면
 * 한쪽만 바뀐다.
 */
export const duelCreateSchema = z.object({
  opponentId: z.string().trim().min(1, '상대를 골라주세요.').max(50),
  // 여기서는 '말이 되는 범위' 만 막는다. 관리자가 정한 실제 범위는 서비스가 본다
  // (duel.service.create) — 이 스키마는 서버가 뜰 때 한 번 만들어져서 바뀐 설정을
  // 따라갈 수 없기 때문이다. 두 겹 중 안쪽이 진짜 규칙이다.
  stake: z
    .number()
    .int('건 포인트는 정수여야 합니다.')
    .min(1, '1P 이상을 걸어주세요.')
    .max(DUEL_STAKE_HARD_MAX),
  hand: z.enum(DUEL_HANDS),
});

export const duelAcceptSchema = z.object({
  hand: z.enum(DUEL_HANDS),
});

/**
 * 퇴근 공격권을 쓸 대상과 종류.
 *
 * 쪽지는 남의 화면에 그대로 뜨는 글이라 길이를 짧게 묶는다. 길게 쓰라고 연 창구가
 * 아니고, 길이를 열어 두면 쪽지가 아니라 메시지 기능이 된다.
 */
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

export const attendancePolicySchema = z.object({
  standardWorkMinutes: z.number().int().min(30).max(1440).optional(),
  requireChecklist: z.boolean().optional(),
  noticeText: z.string().max(300, '안내 문구는 300자를 넘을 수 없습니다.').optional(),
});

export const attendanceReorderSchema = z.object({
  ids: z
    .array(z.number().int().min(1).max(2147483647))
    .min(1, '순서를 지정할 항목이 없습니다.')
    .max(100),
});
