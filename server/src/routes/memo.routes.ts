import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { getMemos, createMemo, updateMemo, deleteMemo } from '../controllers/memo.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/auth-request';
import { validateBody } from '../middlewares/validate.middleware';
import { createMemoSchema, updateMemoSchema } from '../validators/schemas';

const router = Router();
router.use(authenticate as RequestHandler);

/**
 * @swagger
 * /api/memos:
 *   get:
 *     summary: 내 메모 목록
 *     tags: [Memos]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 메모 목록(고정·정렬 순) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/',
  asyncHandler((req, res) => getMemos(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/memos:
 *   post:
 *     summary: 메모 작성
 *     description: 제목과 내용이 모두 비어 있으면 거부한다.
 *     tags: [Memos]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 200 }
 *               content: { type: string, maxLength: 10000 }
 *               color: { type: string, enum: [yellow, green, blue, pink, purple] }
 *     responses:
 *       200: { description: 생성된 메모 }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post(
  '/',
  validateBody(createMemoSchema),
  asyncHandler((req, res) => createMemo(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/memos/{id}:
 *   put:
 *     summary: 메모 수정
 *     description: 고정(isPinned)·정렬(order)만 바꾸는 요청도 허용한다.
 *     tags: [Memos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 200 }
 *               content: { type: string, maxLength: 10000 }
 *               color: { type: string, enum: [yellow, green, blue, pink, purple] }
 *               isPinned: { type: boolean }
 *               order: { type: integer, minimum: 0 }
 *     responses:
 *       200: { description: 수정된 메모 }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put(
  '/:id',
  validateBody(updateMemoSchema),
  asyncHandler((req, res) => updateMemo(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/memos/{id}:
 *   delete:
 *     summary: 메모 삭제
 *     tags: [Memos]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: 삭제 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete(
  '/:id',
  asyncHandler((req, res) => deleteMemo(req as AuthRequest, res))
);

export default router;
