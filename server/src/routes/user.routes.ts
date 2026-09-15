import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { getUserProfile } from '../controllers/social.controller';
import { AuthRequest } from '../types/auth-request';
import {
  getMyPosts,
  getMyComments,
  getMySecurityLogs,
  getMyActivity,
  searchUsers,
} from '../controllers/userProfile.controller';

const router = Router();

router.use(authenticate as RequestHandler);

/**
 * @swagger
 * /api/users/{id}/profile:
 *   get:
 *     summary: 다른 사용자 프로필
 *     description: 보는 사람이 읽을 수 있는 게시판의 공개 글만 집계한다.
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 프로필 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:id/profile',
  requireFeature('social.profiles'),
  asyncHandler((req, res) => getUserProfile(req as AuthRequest, res))
);

router.get(
  '/me/posts',
  asyncHandler((req, res) => getMyPosts(req as AuthRequest, res))
);
router.get(
  '/me/comments',
  asyncHandler((req, res) => getMyComments(req as AuthRequest, res))
);
router.get(
  '/me/security-logs',
  asyncHandler((req, res) => getMySecurityLogs(req as AuthRequest, res))
);
router.get(
  '/me/activity',
  asyncHandler((req, res) => getMyActivity(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/users/search:
 *   get:
 *     summary: 사용자 검색 (@멘션 자동완성용)
 *     description: 아이디·이름 부분 일치, 활성 사용자만 최대 10명.
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: 사용자 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   name: { type: string }
 */
router.get(
  '/search',
  asyncHandler((req, res) => searchUsers(req as AuthRequest, res))
);

export default router;
