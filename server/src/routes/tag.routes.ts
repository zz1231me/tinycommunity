import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { getTags, createTag, updateTag, deleteTag } from '../controllers/tag.controller';
import { getTagCloud, getPostsByTag } from '../controllers/discovery.controller';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { apiLimiter } from '../middlewares/rate-limit.middleware';
import { AuthRequest } from '../types/auth-request';
import { validateBody } from '../middlewares/validate.middleware';
import { createTagSchema, updateTagSchema } from '../validators/schemas';

const router = Router();

// 생성/수정/삭제 인가는 컨트롤러에서 처리:
// 전역(공용) 태그는 admin, 게시판 태그는 admin/manager/해당 게시판 담당자(BoardManager)
/**
 * @swagger
 * /api/tags:
 *   get:
 *     summary: 태그 목록
 *     tags: [Tags]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: boardId
 *         schema: { type: string }
 *         description: 지정하면 해당 게시판의 태그만, 없으면 전역 태그
 *     responses:
 *       200: { description: 태그 목록 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => getTags(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/tags/cloud:
 *   get:
 *     summary: 태그 클라우드
 *     description: 태그별로 "내가 볼 수 있는 글" 개수를 함께 준다. 글이 없는 태그는 빠진다.
 *     tags: [Tags]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 40, maximum: 100 }
 *     responses:
 *       200: { description: '태그 + postCount 목록' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/cloud',
  authenticate as RequestHandler,
  requireFeature('discovery.tagCloud'),
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => getTagCloud(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/tags/{id}/posts:
 *   get:
 *     summary: 태그가 붙은 글 목록
 *     description: 읽을 수 있는 게시판의 글만 돌려준다.
 *     tags: [Tags]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: '{ posts, pagination }' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.get(
  '/:id/posts',
  authenticate as RequestHandler,
  requireFeature('discovery.tagCloud'),
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => getPostsByTag(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/tags:
 *   post:
 *     summary: 태그 생성
 *     tags: [Tags]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 50 }
 *               color: { type: string, description: 'HEX (#f00 또는 #ff0000)' }
 *               description: { type: string, maxLength: 500 }
 *               boardId: { type: string, nullable: true }
 *     responses:
 *       200: { description: 생성된 태그 }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.post(
  '/',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  validateBody(createTagSchema),
  asyncHandler((req, res) => createTag(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/tags/{id}:
 *   put:
 *     summary: 태그 수정
 *     tags: [Tags]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 수정된 태그 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put(
  '/:id',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  validateBody(updateTagSchema),
  asyncHandler((req, res) => updateTag(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/tags/{id}:
 *   delete:
 *     summary: 태그 삭제
 *     description: 게시글에 붙어 있던 연결도 함께 제거된다.
 *     tags: [Tags]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 삭제 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete(
  '/:id',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => deleteTag(req as AuthRequest, res))
);

export default router;
