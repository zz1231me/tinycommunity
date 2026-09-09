import { Response } from 'express';
import { FlatRequest as Request } from '../types/auth-request';
import { auditLogService } from '../services/auditLog.service';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import type { AuditAction, AuditTargetType } from '../models/AuditLog';

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { adminId, targetId, action, targetType, startDate, endDate, page, limit } = req.query;

    const result = await auditLogService.getAuditLogs({
      adminId: typeof adminId === 'string' ? adminId : undefined,
      targetId: typeof targetId === 'string' ? targetId : undefined,
      action: typeof action === 'string' ? (action as AuditAction) : undefined,
      targetType: typeof targetType === 'string' ? (targetType as AuditTargetType) : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    sendSuccess(res, result);
  } catch (error) {
    logError('감사 로그 조회 실패', error);
    sendError(res, 500, '감사 로그 조회 실패');
  }
};

export const getUserAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { action, startDate, endDate, page, limit } = req.query;

    const result = await auditLogService.getAuditLogs({
      targetId: userId,
      action: typeof action === 'string' ? (action as AuditAction) : undefined,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    sendSuccess(res, result);
  } catch (error) {
    logError('사용자 감사 로그 조회 실패', error);
    sendError(res, 500, '감사 로그 조회 실패');
  }
};
