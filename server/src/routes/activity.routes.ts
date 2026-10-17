// 한곳에서 보는 활동 피드.

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { getActivity } from '../controllers/activityFeed.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();

/**
 * @swagger
 * /api/activity:
 *   get:
 *     summary: 읽을 수 있는 게시판의 최근 활동 (새 글·새 댓글·업무 변경)
 *     description: 보는 사람 기준으로 다시 거른다. before 로 이어 본다.
 *     tags: [Discovery]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer } }
 *       - { in: query, name: before, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: 활동 목록 }
 */
router.get(
  '/',
  authenticate as RequestHandler,
  requireFeature('discovery.activity'),
  asyncHandler((req, res) => getActivity(req as AuthRequest, res))
);

export default router;
