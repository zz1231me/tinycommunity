import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';
import { logInfo, logError } from '../utils/logger';
import { boardManagerService } from '../services/boardManager.service';
import { AppError } from '../middlewares/error.middleware';

function toAppError(err: unknown): AppError | null {
  return err instanceof AppError ? err : null;
}

export const listAllBoards = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boards = await boardManagerService.listAllBoards();
    sendSuccess(res, boards);
  } catch (err) {
    logError('전체 게시판 담당자 조회 실패', err);
    sendError(res, 500, '조회 중 오류가 발생했습니다.');
  }
};

export const listByBoard = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardId } = req.params;
  try {
    const managers = await boardManagerService.listByBoard(boardId);
    sendSuccess(res, managers);
  } catch (err) {
    logError('게시판 담당자 조회 실패', err, { boardId });
    sendError(res, 500, '조회 중 오류가 발생했습니다.');
  }
};

export const addManager = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardId } = req.params;
  const { userId } = req.body as { userId?: string };

  if (!userId?.trim()) {
    sendError(res, 400, 'userId가 필요합니다.');
    return;
  }

  try {
    const record = await boardManagerService.add(boardId, userId.trim());
    logInfo('게시판 담당자 추가', { boardId, userId, by: req.user.id });
    sendSuccess(res, record, '담당자가 추가되었습니다.', 201);
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) {
      sendNotFound(res, appErr.message);
      return;
    }
    if (appErr?.statusCode === 409) {
      sendError(res, 409, appErr.message);
      return;
    }
    logError('게시판 담당자 추가 실패', err, { boardId, userId });
    sendError(res, 500, '담당자 추가 중 오류가 발생했습니다.');
  }
};

export const removeManager = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    await boardManagerService.remove(id);
    logInfo('게시판 담당자 삭제', { id, by: req.user.id });
    sendSuccess(res, null, '담당자가 삭제되었습니다.');
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) {
      sendNotFound(res, '게시판 담당자');
      return;
    }
    logError('게시판 담당자 삭제 실패', err, { id });
    sendError(res, 500, '담당자 삭제 중 오류가 발생했습니다.');
  }
};

export const checkIsManager = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType } = req.params;
  const userId = req.user.id;
  try {
    const isManager = await boardManagerService.isManager(boardType, userId);
    sendSuccess(res, { isManager });
  } catch (err) {
    logError('게시판 담당자 여부 확인 실패', err, { boardType, userId });
    sendError(res, 500, '확인 중 오류가 발생했습니다.');
  }
};
