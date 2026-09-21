// /api/drafts. post.routes 의 '/:boardType' catch-all 에 '/drafts' 가 잡히므로 경로를 분리한다.

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
} from '../controllers/postDraft.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();

/**
 * @swagger
 * /api/drafts:
 *   get:
 *     summary: 내 임시저장 목록
 *     description: 본인 것만 보인다. 관리자도 남의 초안은 볼 수 없다.
 *     tags: [Drafts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 임시저장 목록(본문 대신 미리보기) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     summary: 임시저장 생성
 *     tags: [Drafts]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [boardType]
 *             properties:
 *               boardType: { type: string }
 *               title: { type: string }
 *               content: { type: string }
 *     responses:
 *       201: { description: '{ id, updatedAt }' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.get(
  '/',
  authenticate as RequestHandler,
  asyncHandler((req, res) => listDrafts(req as AuthRequest, res))
);
router.post(
  '/',
  authenticate as RequestHandler,
  asyncHandler((req, res) => createDraft(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/drafts/{id}:
 *   get:
 *     summary: 임시저장 이어쓰기 (본문 포함)
 *     tags: [Drafts]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: '{ id, boardType, title, content, updatedAt }' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: 임시저장 갱신 (자동저장)
 *     tags: [Drafts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ id, updatedAt }' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: 임시저장 삭제
 *     tags: [Drafts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 삭제 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:id',
  authenticate as RequestHandler,
  asyncHandler((req, res) => getDraft(req as AuthRequest, res))
);
router.put(
  '/:id',
  authenticate as RequestHandler,
  asyncHandler((req, res) => updateDraft(req as AuthRequest, res))
);
router.delete(
  '/:id',
  authenticate as RequestHandler,
  asyncHandler((req, res) => deleteDraft(req as AuthRequest, res))
);

export default router;
