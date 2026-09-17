import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/auth-request';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  streamNotifications,
} from '../controllers/notification.controller';
import { cacheMiddleware } from '../utils/cache';

const router = Router();

router.use(authenticate as RequestHandler);

// SSE 스트림은 응답이 열린 채로 유지되므로 일반 API rate limit 아래에 두면 안 된다.
// (장시간 연결 1건이 요청 1건으로 계산돼 재연결이 차단될 수 있다)
/**
 * @swagger
 * /api/notifications/stream:
 *   get:
 *     summary: 실시간 알림 스트림 (SSE)
 *     description: |
 *       text/event-stream 으로 알림을 밀어준다. 브라우저는 EventSource 로 연결하며,
 *       인증은 HttpOnly 쿠키가 자동으로 실린다.
 *
 *       이벤트 종류:
 *       - `unread-count` — 연결 직후 1회, 현재 미읽음 수 `{ count }`
 *       - `notification` — 새 알림 `{ id, type, message, link, relatedId, isRead, createdAt }`
 *       - 25초마다 `: ping` 주석 프레임(연결 유지용, 무시해도 됨)
 *
 *       앱이 여러 프로세스로 뜬 경우 다른 프로세스가 만든 알림은 이 스트림으로 오지 않으므로
 *       클라이언트는 폴링 폴백을 함께 유지해야 한다.
 *     tags: [Notifications]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 이벤트 스트림 (연결 유지)
 *         content:
 *           text/event-stream:
 *             schema: { type: string }
 *       401: { description: 인증 필요 }
 */
router.get(
  '/stream',
  asyncHandler((req, res) => streamNotifications(req as AuthRequest, res))
);

router.get(
  '/',
  asyncHandler((req, res) => getNotifications(req as AuthRequest, res))
);
router.get(
  '/unread-count',
  cacheMiddleware('notifications:unread', 30),
  asyncHandler((req, res) => getUnreadCount(req as AuthRequest, res))
);
router.put(
  '/read-all',
  asyncHandler((req, res) => markAllAsRead(req as AuthRequest, res))
);
router.put(
  '/:id/read',
  asyncHandler((req, res) => markAsRead(req as AuthRequest, res))
);
router.delete(
  '/',
  asyncHandler((req, res) => deleteAllNotifications(req as AuthRequest, res))
);
router.delete(
  '/:id',
  asyncHandler((req, res) => deleteNotification(req as AuthRequest, res))
);

export default router;
