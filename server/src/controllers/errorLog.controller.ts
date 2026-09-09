import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendValidationError } from '../utils/response';
import { errorLogService } from '../services/errorLog.service';
import { auditLogService } from '../services/auditLog.service';
import { parsePagination } from '../utils/pagination';
import { logError, logInfo } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

export const getErrorLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit } = parsePagination(req, { defaultLimit: 50, maxLimit: 100 });
  const filters = {
    severity: (req.query.severity as string) || undefined,
    userId: (req.query.userId as string) || undefined,
    route: (req.query.route as string) || undefined,
    dateFrom: (req.query.dateFrom as string) || undefined,
    dateTo: (req.query.dateTo as string) || undefined,
  };
  // Remove undefined values
  Object.keys(filters).forEach(k => {
    if ((filters as any)[k] === undefined) delete (filters as any)[k];
  });

  try {
    const result = await errorLogService.getLogs(filters, page, limit);
    sendSuccess(res, result);
  } catch (err) {
    logError('에러 로그 조회 실패', err);
    sendError(res, 500, '에러 로그 조회 중 오류가 발생했습니다.');
  }
};

/**
 * 에러 로그 일괄 삭제
 * Body: { before?: string (ISO date), severity?: string, ids?: string[] }
 */
export const deleteErrorLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  const { before, severity, ids, all } = req.body as {
    before?: string;
    severity?: string;
    ids?: unknown;
    all?: boolean;
  };

  // ids 배열 타입 및 개수 검증
  if (ids !== undefined) {
    if (!Array.isArray(ids)) {
      sendValidationError(res, 'ids', 'ids는 배열이어야 합니다.');
      return;
    }
    if ((ids as unknown[]).length > 1000) {
      sendValidationError(res, 'ids', 'ids는 최대 1000개까지 처리 가능합니다.');
      return;
    }
    if ((ids as unknown[]).some(id => typeof id !== 'string' && typeof id !== 'number')) {
      sendValidationError(res, 'ids', 'ids의 각 항목은 문자열 또는 숫자여야 합니다.');
      return;
    }
  }
  if (before !== undefined) {
    const parsed = new Date(before);
    if (isNaN(parsed.getTime())) {
      sendValidationError(res, 'before', 'before는 ISO 형식의 날짜여야 합니다.');
      return;
    }
  }

  try {
    // all=true이고 다른 조건이 없을 때만 전체 삭제 — 조건이 함께 오면 조건 삭제 우선
    const deleted =
      all === true && before === undefined && severity === undefined && ids === undefined
        ? await errorLogService.deleteAll()
        : await errorLogService.deleteLogs({
            before,
            severity,
            ids: ids as string[] | undefined,
          });
    logInfo(`에러 로그 삭제: ${deleted}건`, { before, severity, ids });

    // 감사 로그 — 오류 흔적 삭제 추적
    auditLogService
      .createAuditLog({
        adminId: req.user?.id ?? 'unknown',
        adminName: req.user?.name ?? 'unknown',
        action: 'delete_error_log',
        targetType: 'error_log',
        afterValue: {
          before,
          severity,
          idsCount: Array.isArray(ids) ? ids.length : 0,
          deleted,
        },
        ipAddress: req.ip ?? null,
      })
      .catch(auditErr => logError('감사 로그 기록 실패 (에러 로그 삭제)', auditErr));

    sendSuccess(res, { deleted }, `${deleted}건의 에러 로그가 삭제되었습니다.`);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) {
      sendValidationError(res, 'condition', err.message);
      return;
    }
    logError('에러 로그 삭제 실패', err);
    sendError(res, 500, '에러 로그 삭제 중 오류가 발생했습니다.');
  }
};
