import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendValidationError, sendUnauthorized } from '../utils/response';
import { logError } from '../utils/logger';
import { memoService } from '../services/memo.service';
import { AppError } from '../middlewares/error.middleware';

const VALID_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;

export const getMemos = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }
  try {
    const memos = await memoService.getMemos(userId);
    sendSuccess(res, memos);
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('메모 조회 실패', err, { userId });
    sendError(res, 500, '메모 조회 중 오류가 발생했습니다.');
  }
};

export const createMemo = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  const { title, content, color } = req.body;
  if (title !== undefined && typeof title !== 'string') {
    return sendValidationError(res, 'title', '제목은 문자열이어야 합니다.');
  }
  if (content !== undefined && typeof content !== 'string') {
    return sendValidationError(res, 'content', '내용은 문자열이어야 합니다.');
  }
  if (title !== undefined && title.length > 200) {
    return sendValidationError(res, 'title', '제목은 200자를 초과할 수 없습니다.');
  }
  if (content !== undefined && content.length > 10000) {
    return sendValidationError(res, 'content', '내용은 10,000자를 초과할 수 없습니다.');
  }
  if (color !== undefined && !VALID_COLORS.includes(color)) {
    return sendValidationError(
      res,
      'color',
      `색상은 ${VALID_COLORS.join(', ')} 중 하나여야 합니다.`
    );
  }
  // 제목·내용이 모두 비어 있으면 저장 의미 없음 — 댓글/게시글 검증과 일관(클라이언트도 저장 비활성)
  if (
    !(typeof title === 'string' && title.trim()) &&
    !(typeof content === 'string' && content.trim())
  ) {
    return sendValidationError(res, 'content', '제목 또는 내용을 입력해주세요.');
  }

  try {
    // updateMemo와 동일하게 허용 필드만 명시 전달 (UserId/isPinned/order 임의 지정 차단)
    const memo = await memoService.createMemo(userId, { title, content, color });
    sendSuccess(res, memo, '메모가 생성되었습니다.', 201);
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('메모 생성 실패', err, { userId });
    sendError(res, 500, '메모 생성 중 오류가 발생했습니다.');
  }
};

export const updateMemo = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendValidationError(res, 'id', '잘못된 메모 ID입니다.');

  const { title, content, color, isPinned, order } = req.body;
  if (title !== undefined && String(title).length > 200) {
    return sendValidationError(res, 'title', '제목은 200자를 초과할 수 없습니다.');
  }
  if (content !== undefined && String(content).length > 10000) {
    return sendValidationError(res, 'content', '내용은 10,000자를 초과할 수 없습니다.');
  }
  if (color !== undefined && !VALID_COLORS.includes(color)) {
    return sendValidationError(
      res,
      'color',
      `색상은 ${VALID_COLORS.join(', ')} 중 하나여야 합니다.`
    );
  }
  if (isPinned !== undefined && typeof isPinned !== 'boolean') {
    return sendValidationError(res, 'isPinned', 'isPinned는 boolean이어야 합니다.');
  }
  if (order !== undefined && (typeof order !== 'number' || !Number.isInteger(order) || order < 0)) {
    return sendValidationError(res, 'order', 'order는 0 이상의 정수여야 합니다.');
  }

  try {
    // UserId 등 민감 필드 주입 방지 — 허용 필드만 명시적으로 전달
    const memo = await memoService.updateMemo(userId, id, {
      title,
      content,
      color,
      isPinned,
      order,
    });
    sendSuccess(res, memo);
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('메모 수정 실패', err, { userId, memoId: id });
    sendError(res, 500, '메모 수정 중 오류가 발생했습니다.');
  }
};

export const deleteMemo = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendValidationError(res, 'id', '잘못된 메모 ID입니다.');

  try {
    await memoService.deleteMemo(userId, id);
    sendSuccess(res, null, '메모가 삭제되었습니다.');
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('메모 삭제 실패', err, { userId, memoId: id });
    sendError(res, 500, '메모 삭제 중 오류가 발생했습니다.');
  }
};
