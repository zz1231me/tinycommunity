import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getMyAttendance,
  getMyAttendanceHistory,
  checkIn,
  checkOut,
} from '../controllers/attendance.controller';
import { getAttackState, useAttack, useDefend } from '../controllers/attendanceAttack.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { AuthRequest } from '../types/auth-request';
import { validateBody } from '../middlewares/validate.middleware';
import { attendanceAttackSchema, attendanceCheckInSchema } from '../validators/schemas';

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

// ── 퇴근 공격권·방어권 ──────────────────────────────────────────────────────
// 화면에서만 잠그는 장난 기능이다. 아래 어느 경로도 퇴근 기록을 건드리지 않는다.
const attack = Router();
attack.use(requireFeature('tools.attendanceAttack'));

/**
 * @swagger
 * /api/attendance/attack:
 *   get:
 *     summary: 나에게 걸린 퇴근 공격과 내가 남은 횟수
 *     tags: [Attendance]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 걸린 공격(없으면 null)·값·남은 횟수 }
 */
attack.get(
  '/',
  asyncHandler((req, res) => getAttackState(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/attendance/attack:
 *   post:
 *     summary: 공격권을 사서 상대의 퇴근 버튼을 잠깐 잠근다 (화면에서만)
 *     description: 기록되는 퇴근 시각은 영향을 받지 않는다. 누른 순간 그대로 남는다.
 *     tags: [Attendance]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 사용됨 }
 *       400: { description: 포인트 부족·근무 중이 아님 }
 *       409: { description: 이미 공격받는 중 }
 *       429: { description: 오늘 횟수를 모두 사용함 }
 */
attack.post(
  '/',
  validateBody(attendanceAttackSchema),
  asyncHandler((req, res) => useAttack(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/attendance/attack/{id}/defend:
 *   post:
 *     summary: 방어권을 사서 지금 걸린 공격을 푼다
 *     tags: [Attendance]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 풀림 }
 *       403: { description: 나에게 걸린 공격이 아님 }
 *       409: { description: 이미 방어했거나 이미 풀린 공격 }
 */
attack.post(
  '/:id/defend',
  asyncHandler((req, res) => useDefend(req as AuthRequest, res))
);

router.use('/attack', attack);

export default router;
