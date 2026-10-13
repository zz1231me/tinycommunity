// 글 템플릿(쓰는 사람용). 관리자 CRUD 는 admin.routes 에 있다.

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { listTemplates } from '../controllers/postTemplate.controller';

const router = Router();

/**
 * @swagger
 * /api/post-templates:
 *   get:
 *     summary: 고를 수 있는 글 템플릿
 *     description: 켜 둔 것만, 읽을 수 있는 게시판의 것만 온다. boardType 을 주면 그 게시판 것과 공통 템플릿.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '[{ id, name, description, boardType, title, content }]' }
 */
router.get(
  '/',
  authenticate as RequestHandler,
  requireFeature('post.templates'),
  asyncHandler((req, res) => listTemplates(req, res))
);

export default router;
