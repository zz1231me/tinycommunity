// 라우터 전체에 requireFeature를 건다. 기능을 끄면 기존 대화도 열리지 않는다.

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  listConversations,
  getUnreadCount,
  getConversation,
  sendMessage,
  hideConversation,
} from '../controllers/message.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { requireFeature } from '../middlewares/featureGate.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();

router.use(authenticate as RequestHandler);
router.use(requireFeature('social.dm'));

/**
 * @swagger
 * /api/messages/conversations:
 *   get:
 *     summary: 내 대화 목록
 *     description: 최근 메시지 순. 내가 숨긴 대화는 빠지고, 탈퇴한 상대의 대화는 남는다.
 *     tags: [Messages]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 대화 목록 }
 *       403: { description: 메시지 기능이 꺼져 있음 }
 */
router.get(
  '/conversations',
  asyncHandler((req, res) => listConversations(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/messages/unread-count:
 *   get:
 *     summary: 안 읽은 메시지 수
 *     tags: [Messages]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ count }' }
 */
router.get(
  '/unread-count',
  asyncHandler((req, res) => getUnreadCount(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/messages:
 *   post:
 *     summary: 메시지 보내기
 *     description: 대화가 없으면 새로 만든다. 같은 두 사람의 대화는 항상 하나다.
 *     tags: [Messages]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientId, content]
 *             properties:
 *               recipientId: { type: string }
 *               content: { type: string, maxLength: 2000 }
 *     responses:
 *       201: { description: '{ conversationId, message, recipient }' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       429: { description: 너무 많이 보냄 }
 */
router.post(
  '/',
  asyncHandler((req, res) => sendMessage(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/messages/conversations/{id}:
 *   get:
 *     summary: 대화 열기
 *     description: 여는 순간 상대가 보낸 메시지를 읽음 처리한다. cursor 로 이전 메시지를 더 받는다.
 *     tags: [Messages]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: query, name: cursor, schema: { type: integer } }
 *     responses:
 *       200: { description: '{ partner, messages, nextCursor, hasMore }' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: 대화 숨기기
 *     description: 내 목록에서만 사라진다. 상대의 기록은 그대로 남는다.
 *     tags: [Messages]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 숨김 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/conversations/:id',
  asyncHandler((req, res) => getConversation(req as AuthRequest, res))
);
router.delete(
  '/conversations/:id',
  asyncHandler((req, res) => hideConversation(req as AuthRequest, res))
);

export default router;
