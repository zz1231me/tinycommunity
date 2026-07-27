import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendUnauthorized } from '../utils/response';
import { logError } from '../utils/logger';
import { postReadService } from '../services/postRead.service';
import { AppError } from '../middlewares/error.middleware';

export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: postId, boardType } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return;
  }

  try {
    await postReadService.markRead(postId, userId, boardType);
    sendSuccess(res, null, '읽음 처리 완료');
  } catch (err) {
    if (err instanceof AppError) {
      sendError(res, err.statusCode, err.message);
    } else {
      logError('읽음 처리 실패', err, { postId, userId });
      sendError(res, 500, '읽음 처리 중 오류가 발생했습니다.');
    }
  }
};
