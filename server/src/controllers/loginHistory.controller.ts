import { Response } from 'express';
import { FlatRequest as Request } from '../types/auth-request';
import { loginHistoryService } from '../services/loginHistory.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

export const getLoginHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { status, startDate, endDate, page, limit } = req.query;

    const result = await loginHistoryService.getLoginHistory({
      userId,
      status: typeof status === 'string' ? status : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    sendSuccess(res, result);
  } catch (error) {
    logError('로그인 이력 조회 실패', error);
    sendError(res, 500, '로그인 이력 조회 실패');
  }
};

export const getGlobalLoginHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, status, startDate, endDate, page, limit } = req.query;

    const result = await loginHistoryService.getLoginHistory({
      userId: typeof userId === 'string' ? userId : undefined,
      status: typeof status === 'string' ? status : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    sendSuccess(res, result);
  } catch (error) {
    logError('전체 로그인 이력 조회 실패', error);
    sendError(res, 500, '로그인 이력 조회 실패');
  }
};
