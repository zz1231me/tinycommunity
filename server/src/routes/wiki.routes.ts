import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getPageTree,
  getPageBySlug,
  getPageHistory,
  getWikiEditPermissions,
  createPage,
  updatePage,
  deletePage,
} from '../controllers/wiki.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { checkWikiWritePermission } from '../middlewares/wikiPermission';
import { apiLimiter } from '../middlewares/rate-limit.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();
router.use(authenticate as RequestHandler);
router.use(apiLimiter as RequestHandler);

/**
 * @swagger
 * /api/wiki/permissions:
 *   get:
 *     summary: 위키 편집 권한이 있는 역할 목록
 *     tags: [Wiki]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ roles: string[] }' }
 */
router.get(
  '/permissions',
  asyncHandler((req, res) => getWikiEditPermissions(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/wiki:
 *   get:
 *     summary: 위키 페이지 트리
 *     description: 미발행 페이지는 편집 권한이 있는 사용자에게만 포함된다.
 *     tags: [Wiki]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 슬러그 계층 트리 }
 */
router.get(
  '/',
  asyncHandler((req, res) => getPageTree(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/wiki/{slug}:
 *   get:
 *     summary: 위키 페이지 조회
 *     tags: [Wiki]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 페이지 본문 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:slug',
  asyncHandler((req, res) => getPageBySlug(req as AuthRequest, res))
);
// 이력 조회는 읽기 권한으로 충분 — checkWikiWritePermission 불필요
/**
 * @swagger
 * /api/wiki/{slug}/history:
 *   get:
 *     summary: 위키 수정 이력 (최신순 최대 100건)
 *     description: 읽기 권한만 있으면 조회할 수 있다(편집 권한 불필요).
 *     tags: [Wiki]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 리비전 목록(편집자 포함, 탈퇴 시 null) }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:slug/history',
  asyncHandler((req, res) => getPageHistory(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/wiki:
 *   post:
 *     summary: 위키 페이지 생성
 *     tags: [Wiki]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slug, title]
 *             properties:
 *               slug: { type: string, maxLength: 100 }
 *               title: { type: string }
 *               content: { type: string }
 *               parentId: { type: integer, nullable: true }
 *               isPublished: { type: boolean }
 *     responses:
 *       200: { description: 생성된 페이지 }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/',
  checkWikiWritePermission as RequestHandler,
  asyncHandler((req, res) => createPage(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/wiki/{slug}:
 *   put:
 *     summary: 위키 페이지 수정
 *     description: 제목·본문이 바뀌면 리비전이 append-only 로 기록된다.
 *     tags: [Wiki]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 수정된 페이지 }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put(
  '/:slug',
  checkWikiWritePermission as RequestHandler,
  asyncHandler((req, res) => updatePage(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/wiki/{slug}:
 *   delete:
 *     summary: 위키 페이지 삭제
 *     tags: [Wiki]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: slug, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 삭제 완료 }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.delete(
  '/:slug',
  checkWikiWritePermission as RequestHandler,
  asyncHandler((req, res) => deletePage(req as AuthRequest, res))
);

export default router;
