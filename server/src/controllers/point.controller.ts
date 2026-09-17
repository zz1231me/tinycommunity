// server/src/controllers/point.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { pointService } from '../services/point.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

function fail(res: Response, err: unknown, fallback: string, ctx: Record<string, unknown>) {
  if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
  logError(fallback, err, ctx);
  return sendError(res, 500, fallback);
}

/** GET /api/points/me — 잔액·남은 횟수·확률표 */
export const getMyPoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await pointService.getStatus(req.user.id));
  } catch (err) {
    fail(res, err, '포인트 정보를 불러오지 못했습니다.', { userId: req.user.id });
  }
};

/** POST /api/points/attendance — 하루 한 번 출석 포인트 */
export const claimAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pointService.claimAttendance(req.user.id);
    sendSuccess(
      res,
      result,
      result.granted ? '출석 포인트를 받았습니다.' : '오늘은 이미 받았습니다.'
    );
  } catch (err) {
    fail(res, err, '출석 포인트 지급에 실패했습니다.', { userId: req.user.id });
  }
};

/** POST /api/points/lottery — 한 번 뽑기 (결과는 서버가 정한다) */
export const drawLottery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await pointService.draw(req.user.id));
  } catch (err) {
    fail(res, err, '뽑기에 실패했습니다.', { userId: req.user.id });
  }
};

/** GET /api/points/history — 내 적립 내역 */
export const getMyPointHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Number.parseInt(String(req.query.page ?? '1'), 10);
    const limit = Number.parseInt(String(req.query.limit ?? '20'), 10);
    sendSuccess(
      res,
      await pointService.history(
        req.user.id,
        Number.isFinite(page) ? page : 1,
        Number.isFinite(limit) ? limit : 20
      )
    );
  } catch (err) {
    fail(res, err, '적립 내역을 불러오지 못했습니다.', { userId: req.user.id });
  }
};

/** GET /api/points/ranking — 상위 목록과 내 순위 */
export const getPointRanking = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await pointService.ranking(req.user.id));
  } catch (err) {
    fail(res, err, '순위를 불러오지 못했습니다.', { userId: req.user.id });
  }
};
