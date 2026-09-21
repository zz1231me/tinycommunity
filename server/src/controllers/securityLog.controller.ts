import { Request, Response, NextFunction } from 'express';
import { securityLogService } from '../services/securityLog.service';
import { auditLogService } from '../services/auditLog.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError, logInfo } from '../utils/logger';
import type { AuthRequest } from '../types/auth-request';

export const getSecurityLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const userId = req.query.userId as string;
    const ipAddress = req.query.ipAddress as string;
    const action = req.query.action as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const result = await securityLogService.getLogs({
      page,
      limit,
      userId,
      ipAddress,
      action,
      startDate,
      endDate,
    });

    sendSuccess(res, result);
  } catch (error) {
    logError('보안 로그 조회 실패', error);
    next(error);
  }
};

/** 보안 로그 일괄 삭제. before 이전, ids 목록, 둘 다 없으면 전체를 지운다. */
export const deleteSecurityLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { before, ids } = req.body as { before?: string; ids?: unknown };

    if (ids !== undefined && !Array.isArray(ids)) {
      sendError(res, 400, 'ids는 배열이어야 합니다.');
      return;
    }
    if (Array.isArray(ids) && ids.length > 1000) {
      sendError(res, 400, 'ids는 최대 1000개까지 처리 가능합니다.');
      return;
    }
    // before 가 Invalid Date 면 DB 동작을 예측할 수 없으므로 형식을 검증한다.
    if (before !== undefined) {
      const parsed = new Date(before);
      if (isNaN(parsed.getTime())) {
        sendError(res, 400, 'before는 ISO 형식의 날짜여야 합니다.');
        return;
      }
    }

    const deleted = await securityLogService.deleteLogs({
      before,
      ids: ids as string[] | undefined,
    });
    logInfo(`보안 로그 삭제: ${deleted}건`, { before, ids });

    // 보안 로그 삭제는 감사 로그를 남긴다.
    const authReq = req as AuthRequest;
    auditLogService
      .createAuditLog({
        actorId: authReq.user?.id ?? 'unknown',
        actorName: authReq.user?.name ?? 'unknown',
        action: 'delete_security_log',
        targetType: 'security_log',
        afterValue: { before, idsCount: Array.isArray(ids) ? ids.length : 0, deleted },
        ipAddress: req.ip ?? null,
      })
      .catch(err => logError('감사 로그 기록 실패 (보안 로그 삭제)', err));

    sendSuccess(res, { deleted }, `${deleted}건의 보안 로그가 삭제되었습니다.`);
  } catch (error) {
    logError('보안 로그 삭제 실패', error);
    sendError(res, 500, '보안 로그 삭제 중 오류가 발생했습니다.');
  }
};
