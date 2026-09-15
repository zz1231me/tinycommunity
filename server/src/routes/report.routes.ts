// server/src/routes/report.routes.ts - 신고 라우트
import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  createReport,
  getReports,
  reviewReport,
  getReportStats,
} from '../controllers/report.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();

// 신고 제출 (인증된 사용자)
/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: 신고 제출
 *     tags: [Reports]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetType, targetId, reason]
 *             properties:
 *               targetType: { type: string, enum: [post, comment] }
 *               targetId: { type: string }
 *               reason: { type: string }
 *               description: { type: string, maxLength: 500 }
 *     responses:
 *       200: { description: 접수 완료 }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.post(
  '/',
  authenticate as RequestHandler,
  asyncHandler((req, res) => createReport(req as AuthRequest, res))
);

// 신고 통계 (관리자/매니저) — /reports 목록보다 먼저 등록
/**
 * @swagger
 * /api/reports/stats:
 *   get:
 *     summary: 신고 상태별 집계 (관리자·매니저)
 *     tags: [Reports]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 'pending/reviewed/dismissed/action_taken 개수' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/stats',
  authenticate as RequestHandler,
  asyncHandler((req, res) => getReportStats(req as AuthRequest, res))
);

// 신고 목록 (관리자/매니저)
/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: 신고 목록 (관리자·매니저)
 *     tags: [Reports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [pending, reviewed, dismissed, action_taken] } }
 *       - { in: query, name: targetType, schema: { type: string, enum: [post, comment] } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: 신고 목록(페이지네이션) }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/',
  authenticate as RequestHandler,
  asyncHandler((req, res) => getReports(req as AuthRequest, res))
);

// 신고 처리 (관리자/매니저)
/**
 * @swagger
 * /api/reports/{id}/review:
 *   patch:
 *     summary: 신고 처리 (관리자·매니저)
 *     tags: [Reports]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [reviewed, dismissed, action_taken] }
 *               reviewNote: { type: string }
 *     responses:
 *       200: { description: 처리 완료 }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/:id/review',
  authenticate as RequestHandler,
  asyncHandler((req, res) => reviewReport(req as AuthRequest, res))
);

export default router;
