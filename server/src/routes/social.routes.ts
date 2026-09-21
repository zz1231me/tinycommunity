// /api/social 구독·팔로우와 알림 설정. requireFeature 는 구독 쪽에만 건다.

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  toggleSubscription,
  getSubscriptionStatus,
  listSubscriptions,
  getNotificationSettings,
  updateNotificationSettings,
} from '../controllers/social.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();

router.use(authenticate as RequestHandler);

/**
 * @swagger
 * /api/social/notification-settings:
 *   get:
 *     summary: 내 알림 설정
 *     description: 종류별 on/off. 운영 공지(SYSTEM)는 끌 수 없다.
 *     tags: [Social]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ kinds: [{ key, label, description, configurable, enabled }] }' }
 *   put:
 *     summary: 알림 설정 저장
 *     tags: [Social]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 저장 후 전체 상태 }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.get(
  '/notification-settings',
  asyncHandler((req, res) => getNotificationSettings(req as AuthRequest, res))
);
router.put(
  '/notification-settings',
  asyncHandler((req, res) => updateNotificationSettings(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/social/subscriptions:
 *   get:
 *     summary: 내 구독·팔로우 목록
 *     description: 사라진 게시판·탈퇴한 사용자는 빠진다.
 *     tags: [Social]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 구독 목록 }
 */
router.get(
  '/subscriptions',
  requireFeature('social.subscriptions'),
  asyncHandler((req, res) => listSubscriptions(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/social/subscriptions/{targetType}/{targetId}:
 *   get:
 *     summary: 구독 여부
 *     tags: [Social]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: targetType, required: true, schema: { type: string, enum: [board, user] } }
 *       - { in: path, name: targetId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: '{ subscribed }' }
 *   post:
 *     summary: 구독 토글
 *     description: 구독은 알림을 받겠다는 뜻이며 열람 권한을 주지 않는다.
 *     tags: [Social]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ subscribed }' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/subscriptions/:targetType/:targetId',
  requireFeature('social.subscriptions'),
  asyncHandler((req, res) => getSubscriptionStatus(req as AuthRequest, res))
);
router.post(
  '/subscriptions/:targetType/:targetId',
  requireFeature('social.subscriptions'),
  asyncHandler((req, res) => toggleSubscription(req as AuthRequest, res))
);

export default router;
