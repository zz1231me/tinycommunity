import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getMyPoints,
  claimAttendance,
  drawLottery,
  getMyPointHistory,
  getPointRanking,
} from '../controllers/point.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();

// 스위치는 서버에서 막는다 — 화면에서 버튼만 숨기면 API 를 직접 부르는 쪽엔 제약이 없다.
router.use(authenticate as RequestHandler);
router.use(requireFeature('tools.lottery'));

/**
 * @swagger
 * /api/points/me:
 *   get:
 *     summary: 내 포인트 상태 (잔액·남은 뽑기·확률표)
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 잔액과 오늘 남은 횟수, 상품별 확률 }
 */
router.get(
  '/me',
  asyncHandler((req, res) => getMyPoints(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/history:
 *   get:
 *     summary: 내 포인트 적립 내역
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 최신순 원장 페이지 }
 */
router.get(
  '/history',
  asyncHandler((req, res) => getMyPointHistory(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/ranking:
 *   get:
 *     summary: 포인트 랭킹 (상위 10명 + 내 순위)
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 상위 목록과 호출자 본인의 순위 }
 */
router.get(
  '/ranking',
  asyncHandler((req, res) => getPointRanking(req as AuthRequest, res))
);

/**
 * 출석 포인트는 로그인할 때 서버가 알아서 준다(auth.service). 이 엔드포인트는 그 지급을
 * 다시 부를 수 있는 입구이자, "하루 한 번" 보장이 동시 요청에서도 지켜지는지 검증하는 자리다.
 * 화면에서 부르는 곳은 없다 — 나중에 '출석 체크' 버튼을 붙인다면 여기를 쓴다.
 *
 * @swagger
 * /api/points/attendance:
 *   post:
 *     summary: 출석 포인트 받기 (하루 1회, 평소엔 로그인 시 자동 지급)
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 지급 여부와 잔액 }
 */
router.post(
  '/attendance',
  asyncHandler((req, res) => claimAttendance(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/lottery:
 *   post:
 *     summary: 포인트 뽑기 (결과는 서버가 정한다)
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 당첨 포인트와 남은 횟수 }
 *       429: { description: 오늘 횟수를 모두 사용함 }
 */
router.post(
  '/lottery',
  asyncHandler((req, res) => drawLottery(req as AuthRequest, res))
);

export default router;
