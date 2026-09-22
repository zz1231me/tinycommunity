import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getMyPoints,
  claimAttendance,
  drawLottery,
  getMyPointHistory,
  getPointRanking,
} from '../controllers/point.controller';
import { getPointAttackState, halvePoints } from '../controllers/pointAttack.controller';
import {
  getDuels,
  createDuel,
  acceptDuel,
  declineDuel,
  cancelDuel,
  tauntDuel,
} from '../controllers/duel.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import {
  duelAcceptSchema,
  duelCreateSchema,
  duelTauntSchema,
  pointAttackSchema,
} from '../validators/schemas';
import { AuthRequest } from '../types/auth-request';

const router = Router();

// 기능 스위치는 서버에서 막는다.
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
 * 출석 포인트는 로그인 시 자동 지급되며(auth.service), 이 엔드포인트는 수동 호출용이다.
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

// 포인트 대결. 뽑기와 별개로 끌 수 있고, 위의 requireFeature('tools.lottery') 때문에 포인트 기능이 꺼지면 함께 닫힌다.
const duels = Router();
duels.use(requireFeature('tools.pointDuel'));

/**
 * @swagger
 * /api/points/duels:
 *   get:
 *     summary: 받은·건·지난 포인트 대결
 *     description: 상대가 아직 답하지 않은 판에서는 신청자의 손이 내려오지 않는다.
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 받은 대결·내가 건 대결·최근 결과 }
 */
duels.get(
  '/',
  asyncHandler((req, res) => getDuels(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/duels:
 *   post:
 *     summary: 포인트 대결 신청 (건 포인트는 이때 맡겨진다)
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 신청된 대결 }
 *       400: { description: 포인트 부족·잘못된 금액 }
 *       409: { description: 이 상대에게 신청한 대결이 이미 있음 }
 *       429: { description: 동시에 걸어 둘 수 있는 판 수를 넘음 }
 */
duels.post(
  '/',
  validateBody(duelCreateSchema),
  asyncHandler((req, res) => createDuel(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/duels/{id}/accept:
 *   post:
 *     summary: 대결에 응해 손을 낸다 (승부와 정산이 함께 끝난다)
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 정산까지 끝난 판 }
 *       403: { description: 나에게 온 대결이 아님 }
 *       409: { description: 이미 끝난 대결 }
 *       410: { description: 시간이 지난 대결 }
 */
duels.post(
  '/:id/accept',
  validateBody(duelAcceptSchema),
  asyncHandler((req, res) => acceptDuel(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/duels/{id}/decline:
 *   post:
 *     summary: 받은 대결을 거절한다 (신청자가 건 포인트를 돌려받는다)
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 거절됨 }
 */
duels.post(
  '/:id/decline',
  asyncHandler((req, res) => declineDuel(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/duels/{id}:
 *   delete:
 *     summary: 내가 신청한 대결을 거둬들인다
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 취소됨 }
 */
// 이긴 사람의 한마디. 한 판에 한 번이며 검증은 서비스에서 한다.
duels.post(
  '/:id/taunt',
  validateBody(duelTauntSchema),
  asyncHandler((req, res) => tauntDuel(req as AuthRequest, res))
);

duels.delete(
  '/:id',
  asyncHandler((req, res) => cancelDuel(req as AuthRequest, res))
);

router.use('/duels', duels);

// 포인트 절반 날리기. 따로 끌 수 있고, 위의 requireFeature('tools.lottery') 로 포인트가 꺼지면 함께 닫힌다.
const attack = Router();
attack.use(requireFeature('tools.pointAttack'));

/**
 * @swagger
 * /api/points/attack:
 *   get:
 *     summary: 포인트 절반 날리기의 값·확률과 오늘 남은 횟수
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 값, 성공 확률, 남은 횟수 }
 */
attack.get(
  '/',
  asyncHandler((req, res) => getPointAttackState(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/points/attack/halve:
 *   post:
 *     summary: 한 번 던진다 (성공하면 상대 포인트의 절반이 사라진다)
 *     description: 성공 여부는 서버가 정한다. 실패해도 값은 돌려주지 않으며, 누가 걸었는지는 상대에게 알리지 않는다.
 *     tags: [Points]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 성공 여부와 사라진 포인트 }
 *       429: { description: 오늘 횟수를 모두 사용함 }
 */
attack.post(
  '/halve',
  validateBody(pointAttackSchema),
  asyncHandler((req, res) => halvePoints(req as AuthRequest, res))
);

router.use('/attack', attack);

export default router;
