// server/src/routes/feature.routes.ts
// /api/features — 지금 켜져 있는 기능 목록.
// 화면이 메뉴·버튼을 숨기는 데 쓴다. 실제 차단은 각 라우트의 requireFeature 가 한다.

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { getEnabledFeatures } from '../controllers/featureFlag.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/features:
 *   get:
 *     summary: 켜져 있는 기능 목록
 *     description: '{ "post.like": true, ... } 형태. 화면 숨김 판단용이며 차단은 각 API가 한다.'
 *     tags: [Features]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 기능 키 → 사용 여부 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/',
  authenticate as RequestHandler,
  asyncHandler((req, res) => getEnabledFeatures(req, res))
);

export default router;
