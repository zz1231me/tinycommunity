import { Response } from 'express';

import { userSessionService } from '../services/userSession.service';
import { auditLogService } from '../services/auditLog.service';
import { logSecurityEvent } from '../services/securityLog.service';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';
import { logError } from '../utils/logger';
import { invalidateUserCache } from '../middlewares/auth.middleware';
import { User } from '../models/User';
import { FlatRequest as Request, type AuthRequest } from '../types/auth-request';

export const getUserSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const sessions = await userSessionService.getActiveSessions(userId);
    sendSuccess(res, sessions);
  } catch (error) {
    logError('세션 목록 조회 실패', error);
    sendError(res, 500, '세션 목록 조회 실패');
  }
};

export const forceLogoutSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, sessionId } = req.params;
    const authReq = req as unknown as AuthRequest;

    // 여기서 자기 세션을 끊으면 tokenVersion 이 올라 관리자 본인이 즉시 로그아웃된다.
    if (authReq.user?.id === userId) {
      sendError(res, 400, '본인의 세션은 관리자 메뉴에서 종료할 수 없습니다.');
      return;
    }

    // 다른 사용자의 세션을 끊지 못하도록 소유자를 확인한다.
    const { UserSession } = await import('../models/UserSession');
    const session = await UserSession.findByPk(sessionId, { attributes: ['id', 'userId'] });
    if (!session) {
      sendNotFound(res, '세션');
      return;
    }
    if (session.userId !== userId) {
      sendError(res, 403, '해당 세션에 대한 접근 권한이 없습니다.');
      return;
    }

    const success = await userSessionService.forceLogout(sessionId);

    if (!success) {
      sendNotFound(res, '세션');
      return;
    }

    // tokenVersion 을 올려 기존 JWT 를 모두 무효화한다.
    try {
      const user = await User.findByPk(userId);
      if (user) {
        await user.increment('tokenVersion');
        invalidateUserCache(userId); // 인증 미들웨어 캐시도 즉시 제거
      }
    } catch (tvErr) {
      logError('강제 종료 후 tokenVersion 증가 실패', tvErr);
      // 실패해도 세션 비활성화는 끝났으므로 계속 진행한다.
    }

    auditLogService
      .createAuditLog({
        actorId: authReq.user?.id ?? 'unknown',
        actorName: authReq.user?.name ?? 'unknown',
        action: 'force_logout',
        targetType: 'user',
        targetId: userId,
        afterValue: { sessionId, forcedAt: new Date().toISOString() },
        ipAddress: req.ip ?? null,
      })
      .catch(err => logError('감사 로그 기록 실패 (강제 로그아웃)', err));

    sendSuccess(res, null, '세션이 강제 종료되었습니다.');
  } catch (error) {
    logError('세션 강제 종료 실패', error);
    sendError(res, 500, '세션 강제 종료 실패');
  }
};

export const getOwnSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as unknown as AuthRequest;
    if (!authReq.user?.id) {
      sendError(res, 401, '인증 정보가 없습니다.');
      return;
    }
    // 현재 요청의 refresh_token 으로 isCurrent 를 표시한다.
    const currentRaw = (req as unknown as { cookies?: Record<string, string | undefined> }).cookies
      ?.refresh_token;
    const sessions = await userSessionService.getActiveSessions(authReq.user.id, currentRaw);
    sendSuccess(res, sessions);
  } catch (error) {
    logError('내 세션 목록 조회 실패', error);
    sendError(res, 500, '세션 목록 조회 실패');
  }
};

// 본인의 다른 기기 세션을 끊는다. 현재 세션은 로그아웃 흐름을 쓴다.
export const terminateOwnSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as unknown as AuthRequest;
    const userId = authReq.user?.id;
    if (!userId) {
      sendError(res, 401, '인증 정보가 없습니다.');
      return;
    }
    const { sessionId } = req.params;
    const currentRaw = (req as unknown as { cookies?: Record<string, string | undefined> }).cookies
      ?.refresh_token;
    const result = await userSessionService.terminateOwnSession(userId, sessionId, currentRaw);
    if (result === 'not_found') {
      sendNotFound(res, '세션');
      return;
    }
    if (result === 'forbidden') {
      sendError(res, 403, '해당 세션에 대한 권한이 없습니다.');
      return;
    }
    if (result === 'is_current') {
      sendError(res, 400, '현재 사용 중인 세션입니다. 로그아웃을 이용해주세요.');
      return;
    }
    logSecurityEvent(authReq, 'SESSION_TERMINATED', { userId, details: { sessionId } });
    sendSuccess(res, null, '세션을 종료했습니다.');
  } catch (error) {
    logError('내 세션 종료 실패', error);
    sendError(res, 500, '세션 종료 실패');
  }
};
