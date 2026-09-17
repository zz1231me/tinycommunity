// server/src/controllers/attendanceAttack.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { attendanceAttackService } from '../services/attendanceAttack.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

function fail(res: Response, err: unknown, fallback: string, ctx: Record<string, unknown>) {
  if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
  logError(fallback, err, ctx);
  return sendError(res, 500, fallback);
}

function attackId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, '잘못된 번호입니다.');
  return id;
}

/** GET /api/attendance/attack — 나에게 걸린 공격과 내가 쓸 수 있는 횟수 */
export const getAttackState = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await attendanceAttackService.state(req.user.id));
  } catch (err) {
    fail(res, err, '공격 정보를 불러오지 못했습니다.', { userId: req.user.id });
  }
};

/** POST /api/attendance/attack — 공격권을 사서 바로 쓴다 */
export const useAttack = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await attendanceAttackService.attack(req.user.id, req.body.targetId);
    sendSuccess(res, result, '공격권을 사용했습니다.');
  } catch (err) {
    fail(res, err, '공격권을 사용하지 못했습니다.', { userId: req.user.id });
  }
};

/** POST /api/attendance/attack/:id/defend — 방어권을 사서 지금 걸린 공격을 푼다 */
export const useDefend = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await attendanceAttackService.defend(req.user.id, attackId(req.params.id));
    sendSuccess(res, result, '방어했습니다.');
  } catch (err) {
    fail(res, err, '방어하지 못했습니다.', { userId: req.user.id, id: req.params.id });
  }
};
