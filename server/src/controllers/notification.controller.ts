import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';
import { logError } from '../utils/logger';
import { notificationService } from '../services/notification.service';
import { invalidateCache } from '../utils/cache';
import { AppError } from '../middlewares/error.middleware';
import { addConnection } from '../services/sse.service';

// GET /api/notifications
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20), 50);
  const cursorRaw = req.query.cursor ? parseInt(String(req.query.cursor), 10) : undefined;
  const cursor = cursorRaw && !isNaN(cursorRaw) ? cursorRaw : undefined;

  try {
    const result = await notificationService.getNotifications(userId, cursor, limit);
    sendSuccess(res, result);
  } catch (err) {
    logError('알림 조회 실패', err, { userId });
    sendError(res, 500, '알림 조회 실패');
  }
};

// GET /api/notifications/unread-count
export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  try {
    const count = await notificationService.getUnreadCount(userId);
    sendSuccess(res, { count });
  } catch (err) {
    logError('알림 카운트 조회 실패', err, { userId });
    sendError(res, 500, '알림 카운트 조회 실패');
  }
};

// PUT /api/notifications/:id/read
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendError(res, 400, '유효하지 않은 알림 ID입니다.');
    return;
  }

  try {
    const unreadCount = await notificationService.markAsRead(id, userId);
    invalidateCache('notifications:unread', userId);
    // 서버가 센 수를 함께 준다. 화면이 스스로 깎으면 스트림 값과 겹쳐 두 번 깎인다.
    sendSuccess(res, { unreadCount }, '알림을 읽었습니다.');
  } catch (err: unknown) {
    if (err instanceof AppError && err.statusCode === 404) return sendNotFound(res, '알림');
    logError('알림 읽음 처리 실패', err, { userId, notificationId: id });
    sendError(res, 500, '알림 읽음 처리 실패');
  }
};

// PUT /api/notifications/read-all
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  try {
    const unreadCount = await notificationService.markAllAsRead(userId);
    invalidateCache('notifications:unread', userId);
    sendSuccess(res, { unreadCount }, '모든 알림을 읽었습니다.');
  } catch (err) {
    logError('전체 알림 읽음 처리 실패', err, { userId });
    sendError(res, 500, '전체 읽음 처리 실패');
  }
};

// DELETE /api/notifications/:id
export const deleteNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    sendError(res, 400, '유효하지 않은 알림 ID입니다.');
    return;
  }

  try {
    const unreadCount = await notificationService.deleteNotification(id, userId);
    invalidateCache('notifications:unread', userId);
    sendSuccess(res, { unreadCount }, '알림이 삭제되었습니다.');
  } catch (err: unknown) {
    if (err instanceof AppError && err.statusCode === 404) return sendNotFound(res, '알림');
    logError('알림 삭제 실패', err, { userId, notificationId: id });
    sendError(res, 500, '알림 삭제 실패');
  }
};

// DELETE /api/notifications  → 내 알림 전체 삭제
export const deleteAllNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  try {
    const deletedCount = await notificationService.deleteAllNotifications(userId);
    sendSuccess(res, { deletedCount }, '모든 알림이 삭제되었습니다.');
  } catch (err) {
    logError('전체 알림 삭제 실패', err, { userId });
    sendError(res, 500, '전체 알림 삭제 실패');
  }
};

// GET /api/notifications/stream (SSE)
// EventSource 는 커스텀 헤더를 못 붙이지만 인증이 HttpOnly 쿠키라 그대로 동작한다.
export const streamNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // nginx 가 버퍼링하면 이벤트가 즉시 전달되지 않는다.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  addConnection(userId, res);

  // 연결 직후 미읽음 수를 한 번 내려 뱃지를 맞춘다.
  try {
    const count = await notificationService.getUnreadCount(userId);
    res.write(`event: unread-count\ndata: ${JSON.stringify({ count })}\n\n`);
  } catch (err) {
    logError('SSE 초기 미읽음 수 조회 실패', err, { userId });
  }
};
