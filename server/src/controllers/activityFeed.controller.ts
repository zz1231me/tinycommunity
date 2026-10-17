// 한곳에서 보는 활동 피드.

import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { listActivity, MAX_LIMIT } from '../services/activityFeed.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';

/** GET /api/activity?limit=&before= */
export const getActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(1, rawLimit), MAX_LIMIT) : undefined;

  // 이어 보기는 '이 시각보다 이전' 으로 집는다. 읽을 수 없는 줄이 섞여 걸러지므로
  // 몇 번째인지(offset)로는 줄이 새거나 겹친다.
  const rawBefore = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
  const before = rawBefore && !Number.isNaN(rawBefore.getTime()) ? rawBefore : undefined;

  try {
    sendSuccess(res, await listActivity(req.user.id, req.user.role, { limit, before }));
  } catch (err) {
    logError('활동 피드 조회 실패', err, { userId: req.user.id });
    sendError(res, 500, '활동을 불러오지 못했습니다.');
  }
};
