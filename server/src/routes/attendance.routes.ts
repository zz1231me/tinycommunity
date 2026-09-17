import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getMyAttendance,
  getMyAttendanceHistory,
  checkIn,
  checkOut,
} from '../controllers/attendance.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/auth-request';
import { validateBody } from '../middlewares/validate.middleware';
import { attendanceCheckInSchema } from '../validators/schemas';

const router = Router();
router.use(authenticate as RequestHandler);

/**
 * @swagger
 * /api/attendance/me:
 *   get:
 *     summary: 오늘 내 출퇴근 상태
 *     description: 오늘 기록과 함께 확인 항목·근무 설정을 돌려준다.
 *     tags: [Attendance]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 오늘 기록(없으면 null)·확인 항목·기준 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/me',
  asyncHandler((req, res) => getMyAttendance(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/attendance/me/history:
 *   get:
 *     summary: 내 월별 출퇴근 기록
 *     tags: [Attendance]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: query, name: month, schema: { type: string }, description: 'YYYY-MM (없으면 이번 달)' }
 *     responses:
 *       200: { description: 그 달의 기록과 요약 }
 */
router.get(
  '/me/history',
  asyncHandler((req, res) => getMyAttendanceHistory(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: 출근 기록
 *     description: 필수 확인 항목을 모두 체크해야 기록된다. 하루 한 건만 남는다.
 *     tags: [Attendance]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               responses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemId: { type: integer }
 *                     checked: { type: boolean }
 *               note: { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: 기록된 출근 }
 *       400: { description: 확인하지 않은 필수 항목이 있음 }
 *       409: { description: 오늘 이미 출근을 기록함 }
 */
router.post(
  '/check-in',
  validateBody(attendanceCheckInSchema),
  asyncHandler((req, res) => checkIn(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: 퇴근 기록
 *     tags: [Attendance]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 기록된 퇴근 }
 *       400: { description: 오늘 출근 기록이 없음 }
 *       409: { description: 오늘 이미 퇴근을 기록함 }
 */
router.post(
  '/check-out',
  asyncHandler((req, res) => checkOut(req as AuthRequest, res))
);

export default router;
