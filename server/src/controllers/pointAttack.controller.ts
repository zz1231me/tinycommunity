import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { pointAttackService } from '../services/pointAttack.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

function fail(res: Response, err: unknown, fallback: string, ctx: Record<string, unknown>) {
  if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
  logError(fallback, err, ctx);
  return sendError(res, 500, fallback);
}

/** GET /api/points/attack — 값·확률·남은 횟수 */
export const getPointAttackState = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await pointAttackService.state(req.user.id));
  } catch (err) {
    fail(res, err, '공격 정보를 불러오지 못했습니다.', { userId: req.user.id });
  }
};

/** POST /api/points/attack/halve — 한 번 던진다 */
export const halvePoints = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pointAttackService.halve(req.user.id, { targetId: req.body?.targetId });
    sendSuccess(
      res,
      result,
      result.succeeded ? '공격이 통했습니다!' : '아무 일도 일어나지 않았습니다.'
    );
  } catch (err) {
    fail(res, err, '공격하지 못했습니다.', { userId: req.user.id });
  }
};
