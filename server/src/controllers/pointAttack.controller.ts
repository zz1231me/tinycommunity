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
    // 사라진 액수도 함께 보낸다. 그 두 배가 상대의 잔액이지만, 1% × 300P 라 잔액을 캐는
    // 수단으로 쓰기에는 값이 터무니없다. 공격자가 무엇을 했는지 아는 편이 낫다.
    sendSuccess(
      res,
      result,
      result.succeeded ? '공격이 통했습니다!' : '아무 일도 일어나지 않았습니다.'
    );
  } catch (err) {
    fail(res, err, '공격하지 못했습니다.', { userId: req.user.id });
  }
};

/** GET /api/admin/point-attacks — 관리자용 기록. 익명은 당한 사람에게만 지킨다. */
export const getPointAttackLog = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Number.parseInt(String(req.query.page ?? '1'), 10);
    const limit = Number.parseInt(String(req.query.limit ?? '30'), 10);
    sendSuccess(
      res,
      await pointAttackService.listForAdmin({
        page: Number.isFinite(page) ? page : 1,
        limit: Number.isFinite(limit) ? limit : 30,
      })
    );
  } catch (err) {
    fail(res, err, '공격 기록을 불러오지 못했습니다.', { userId: req.user.id });
  }
};
