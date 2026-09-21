import { ErrorLog, ErrorLogAttributes } from '../models/ErrorLog';
import { BaseService } from './base.service';
import { Op } from 'sequelize';
import { AppError } from '../middlewares/error.middleware';
import { logError } from '../utils/logger';
import { clampText, clampJson } from '../utils/clamp';

/** requestBody(JSON) 한 건의 상한. 넘으면 크기만 남기고 자른다. */
const REQUEST_BODY_MAX_CHARS = 8000;

export class ErrorLogService extends BaseService {
  async createLog(data: Omit<ErrorLogAttributes, 'id' | 'createdAt'>): Promise<void> {
    try {
      // 컬럼 폭에 맞춰 자른 뒤 넣는다. route 는 요청자가 정하는 값이라 길이 초과로 INSERT 가 거부될 수 있다.
      await ErrorLog.create({
        ...data,
        userId: clampText(data.userId, 50),
        userName: clampText(data.userName, 100),
        userRole: clampText(data.userRole, 50),
        route: clampText(data.route, 500),
        method: clampText(data.method, 10),
        errorCode: clampText(data.errorCode, 50),
        requestBody: clampJson(data.requestBody, REQUEST_BODY_MAX_CHARS),
      });
    } catch (error) {
      // 로그 저장 실패는 요청을 막지 않되 무음으로 두지도 않는다.
      logError('에러 로그 저장 실패', error);
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
      // LIKE 와일드카드 이스케이프
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
        // 날짜만 지정한 경우 그날 끝까지 포함한다. 그러지 않으면 종료일 당일이 빠진다.
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo.trim())) d.setUTCHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = d;
      }
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await ErrorLog.findAndCountAll({
      where,
      // 시각이 같으면 id 로 가른다. 없으면 페이지 경계에서 행이 중복·누락된다.
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset,
    });

    return {
      logs: rows,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    };
  }

  /**
   * 오래된 에러 로그 삭제.
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
   * 조건부 에러 로그 일괄 삭제.
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
        // 조건 없는 전체 삭제는 deleteAll() 로만 한다
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
