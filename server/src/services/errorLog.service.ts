import { ErrorLog, ErrorLogAttributes } from '../models/ErrorLog';
import { BaseService } from './base.service';
import { Op } from 'sequelize';
import { AppError } from '../middlewares/error.middleware';

export class ErrorLogService extends BaseService {
  async createLog(data: Omit<ErrorLogAttributes, 'id' | 'createdAt'>): Promise<void> {
    try {
      await ErrorLog.create(data);
    } catch {
      // Silently fail — logging must never crash the app
    }
  }

  async getLogs(
    filters: {
      severity?: string;
      userId?: string;
      route?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    page = 1,
    limit = 50
  ) {
    const where: any = {};
    if (filters.severity) where.severity = filters.severity;
    if (filters.userId) where.userId = filters.userId;
    if (filters.route) {
      // LIKE 와일드카드 문자 이스케이프 (%, _, \)
      const escapedRoute = filters.route.replace(/[%_\\]/g, '\\$&');
      where.route = { [Op.like]: `%${escapedRoute}%` };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        const d = new Date(filters.dateFrom);
        if (isNaN(d.getTime())) throw new AppError(400, 'dateFrom이 유효한 날짜 형식이 아닙니다.');
        where.createdAt[Op.gte] = d;
      }
      if (filters.dateTo) {
        const d = new Date(filters.dateTo);
        if (isNaN(d.getTime())) throw new AppError(400, 'dateTo가 유효한 날짜 형식이 아닙니다.');
        // 날짜만 지정(YYYY-MM-DD)한 경우 해당 일자 끝까지 포함 — Op.lte가 자정을 가리켜
        // 종료일 당일 레코드가 통째로 빠지는 문제 방지
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo.trim())) d.setUTCHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = d;
      }
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await ErrorLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return {
      logs: rows,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    };
  }

  /**
   * 오래된 에러 로그 자동 삭제
   * @param retentionDays 보존 기간 (기본 30일)
   * @returns 삭제된 로그 수
   */
  async deleteOldLogs(retentionDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    return ErrorLog.destroy({
      where: { createdAt: { [Op.lt]: cutoffDate } },
    });
  }

  /**
   * 선택적 조건으로 에러 로그 일괄 삭제
   * @param options.before 특정 날짜 이전 로그만 삭제
   * @param options.severity 특정 severity만 삭제 (before와 조합 가능)
   * @param options.ids 특정 ID 목록만 삭제 (지정 시 다른 조건 무시)
   * @returns 삭제된 로그 수
   */
  async deleteLogs(
    options: { before?: string; severity?: string; ids?: string[] } = {}
  ): Promise<number> {
    const where: any = {};

    if (options.ids && options.ids.length > 0) {
      where.id = { [Op.in]: options.ids };
    } else {
      if (options.before) {
        const d = new Date(options.before);
        if (isNaN(d.getTime())) throw new AppError(400, 'before가 유효한 날짜 형식이 아닙니다.');
        where.createdAt = { [Op.lt]: d };
      }
      if (options.severity) where.severity = options.severity;
      if (Object.keys(where).length === 0) {
        // 조건 없는 전체 삭제는 deleteAll()을 명시적으로 사용해야 함
        throw new AppError(400, '삭제 조건(before, severity, ids)을 최소 하나 이상 지정해주세요.');
      }
    }

    return ErrorLog.destroy({ where });
  }

  /** 전체 에러 로그 삭제 */
  async deleteAll(): Promise<number> {
    return ErrorLog.destroy({ where: {} });
  }
}

export const errorLogService = new ErrorLogService();
