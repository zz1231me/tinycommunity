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
} from '../controllers/notification.controller';
import { cacheMiddleware } from '../utils/cache';
import { apiLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

router.use(authenticate as RequestHandler);
router.use(apiLimiter);

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
