// server/src/controllers/message.controller.ts
// 메시지 — 대화 목록·읽기·보내기·숨기기.

import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendServiceError } from '../utils/response';
import { messageService } from '../services/message.service';

export const listConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    sendSuccess(res, await messageService.listConversations(userId));
  } catch (err) {
    sendServiceError(res, err, '대화 목록을 불러오지 못했습니다.', { userId });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    sendSuccess(res, { count: await messageService.unreadCount(userId) });
  } catch (err) {
    sendServiceError(res, err, '안 읽은 메시지 수를 확인하지 못했습니다.', { userId });
  }
};

export const getConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  const rawCursor = req.query.cursor?.toString();
  const cursor = rawCursor ? Number.parseInt(rawCursor, 10) : undefined;

  try {
    sendSuccess(
      res,
      await messageService.getMessages(
        req.params.id,
        userId,
        Number.isFinite(cursor) ? cursor : undefined
      )
    );
  } catch (err) {
    sendServiceError(res, err, '대화를 불러오지 못했습니다.', {
      userId,
      conversationId: req.params.id,
    });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  const recipientId = String(
    (req.body as { recipientId?: unknown } | undefined)?.recipientId ?? ''
  );
  const content = String((req.body as { content?: unknown } | undefined)?.content ?? '');

  if (!recipientId) {
    sendError(res, 400, '받는 사람을 지정해주세요.');
    return;
  }

  try {
    sendSuccess(res, await messageService.send(userId, recipientId, content), undefined, 201);
  } catch (err) {
    sendServiceError(res, err, '메시지를 보내지 못했습니다.', { userId, recipientId });
  }
};

export const hideConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId } = req.user;
  try {
    await messageService.hide(req.params.id, userId);
    sendSuccess(res, { hidden: true });
  } catch (err) {
    sendServiceError(res, err, '대화를 숨기지 못했습니다.', {
      userId,
      conversationId: req.params.id,
    });
  }
};
