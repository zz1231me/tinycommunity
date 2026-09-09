import { BaseService } from './base.service';
import { AuditLog, AuditAction, AuditTargetType } from '../models/AuditLog';
import { Op } from 'sequelize';
import { logError } from '../utils/logger';

interface CreateAuditLogDTO {
  adminId: string;
  adminName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  targetName?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeValue?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  afterValue?: any;
  ipAddress?: string | null;
}

interface GetAuditLogsDTO {
  adminId?: string;
  targetId?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export class AuditLogService extends BaseService {
  /**
   * 감사 로그 생성 (fire-and-forget)
   */
  async createAuditLog(data: CreateAuditLogDTO): Promise<void> {
    try {
      await AuditLog.create(data);
    } catch (error) {
      logError('감사 로그 저장 실패', error);
    }
  }

  /**
   * 감사 로그 조회
   */
  async getAuditLogs(params: GetAuditLogsDTO) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (params.adminId) {
      where.adminId = params.adminId;
    }

    if (params.targetId) {
      where.targetId = params.targetId;
    }

    if (params.action) {
      where.action = params.action;
    }

    if (params.targetType) {
      where.targetType = params.targetType;
    }

    // 날짜 파라미터 유효성 검증 (Invalid Date → DB 쿼리 오류 방지)
    const startDateObj = params.startDate ? new Date(params.startDate) : null;
    const endDateObj = params.endDate ? new Date(params.endDate) : null;
    const validStart = startDateObj && !isNaN(startDateObj.getTime()) ? startDateObj : null;
    const validEnd = endDateObj && !isNaN(endDateObj.getTime()) ? endDateObj : null;
    // 종료일을 날짜만(YYYY-MM-DD) 지정한 경우 해당 일자 끝까지 포함 (당일 누락 방지)
    if (validEnd && params.endDate && /^\d{4}-\d{2}-\d{2}$/.test(params.endDate.trim())) {
      validEnd.setUTCHours(23, 59, 59, 999);
    }

    if (validStart && validEnd) {
      where.createdAt = { [Op.between]: [validStart, validEnd] };
    } else if (validStart) {
      where.createdAt = { [Op.gte]: validStart };
    } else if (validEnd) {
      where.createdAt = { [Op.lte]: validEnd };
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      logs: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  }

  /**
   * 오래된 감사 로그 자동 삭제
   */
  async deleteOldLogs(retentionDays = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return AuditLog.destroy({
      where: { createdAt: { [Op.lt]: cutoffDate } },
    });
  }
}

export const auditLogService = new AuditLogService();
