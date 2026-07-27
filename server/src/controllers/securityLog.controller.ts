import { Request, Response, NextFunction } from 'express';
import { securityLogService } from '../services/securityLog.service';
import { auditLogService } from '../services/auditLog.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError, logInfo } from '../utils/logger';
import type { AuthRequest } from '../types/auth-request';

/**
 * 보안 로그 목록 조회
 */
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

/**
 * 보안 로그 일괄 삭제
 * Body: { before?: string (ISO date), ids?: string[] }
 * before만 지정하면 해당 날짜 이전 로그 삭제
 * ids 지정하면 해당 ID 목록만 삭제
 * 둘 다 없으면 전체 삭제
 */
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
    // before가 들어오면 ISO 형식 검증 — Invalid Date로 DB가 예측 불가 동작하는 것 차단
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

    // 보안 사고 흔적 삭제는 강력한 admin 행위 — 감사 로그 필수
    const authReq = req as AuthRequest;
    auditLogService
      .createAuditLog({
        adminId: authReq.user?.id ?? 'unknown',
        adminName: authReq.user?.name ?? 'unknown',
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
