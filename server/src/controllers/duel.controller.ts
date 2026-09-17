// server/src/controllers/duel.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { duelService } from '../services/duel.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

function fail(res: Response, err: unknown, fallback: string, ctx: Record<string, unknown>) {
  if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
  logError(fallback, err, ctx);
  return sendError(res, 500, fallback);
}

/** 라우트 파라미터의 판 번호. 숫자가 아니면 찾아볼 것도 없다. */
function duelId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, '잘못된 대결 번호입니다.');
  return id;
}

/** GET /api/points/duels — 받은·건·지난 대결 */
export const getDuels = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await duelService.status(req.user.id));
  } catch (err) {
    fail(res, err, '대결 정보를 불러오지 못했습니다.', { userId: req.user.id });
  }
};

/** POST /api/points/duels — 신청 (거는 포인트는 이때 빠진다) */
export const createDuel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const duel = await duelService.create(req.user.id, req.body);
    sendSuccess(res, duel, '대결을 신청했습니다.');
  } catch (err) {
    fail(res, err, '대결을 신청하지 못했습니다.', { userId: req.user.id });
  }
};

/** POST /api/points/duels/:id/accept — 손을 내고 그 자리에서 정산한다 */
export const acceptDuel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const duel = await duelService.accept(req.user.id, duelId(req.params.id), req.body.hand);
    sendSuccess(res, duel);
  } catch (err) {
    fail(res, err, '대결에 응하지 못했습니다.', { userId: req.user.id, id: req.params.id });
  }
};

/** POST /api/points/duels/:id/decline — 거절 */
export const declineDuel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await duelService.decline(req.user.id, duelId(req.params.id));
    sendSuccess(res, null, '대결을 거절했습니다.');
  } catch (err) {
    fail(res, err, '대결을 거절하지 못했습니다.', { userId: req.user.id, id: req.params.id });
  }
};

/** DELETE /api/points/duels/:id — 신청자가 거둬들인다 */
export const cancelDuel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await duelService.cancel(req.user.id, duelId(req.params.id));
    sendSuccess(res, null, '대결을 취소했습니다.');
  } catch (err) {
    fail(res, err, '대결을 취소하지 못했습니다.', { userId: req.user.id, id: req.params.id });
  }
};
