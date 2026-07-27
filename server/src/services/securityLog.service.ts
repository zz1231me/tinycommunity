import { BaseService } from './base.service';
import { SecurityLog } from '../models/SecurityLog';
import { User } from '../models/User';
import { Op } from 'sequelize';
import { logError } from '../utils/logger';

interface CreateLogDTO {
  userId?: string | null;
  ipAddress: string;
  action: string;
  method: string;
  route: string;
  userAgent?: string;
  status: string;
  details?: any;
}

interface GetLogsDTO {
  page?: number;
  limit?: number;
  userId?: string;
  ipAddress?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}

export class SecurityLogService extends BaseService {
  /**
   * 보안 로그 생성
   * 비동기로 실행하여 메인 로직 성능 영향 최소화 (await 없이 호출 가능)
   */
  async createLog(data: CreateLogDTO): Promise<void> {
    try {
      await SecurityLog.create({
        ...data,
        userAgent: data.userAgent?.substring(0, 255) || 'Unknown', // 길이 제한 방지
      });
    } catch (error) {
      logError('보안 로그 저장 실패', error);
      // 로그 저장이 실패해도 메인 로직은 중단되지 않도록 throw하지 않음
    }
  }

  /**
   * 로그 조회 (관리자용)
   */
  async getLogs(params: GetLogsDTO) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    const where: any = {};

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.ipAddress) {
      const escapedIp = params.ipAddress.replace(/[%_\\]/g, '\\$&');
      where.ipAddress = { [Op.like]: `%${escapedIp}%` };
    }

    if (params.action) {
      where.action = params.action;
    }

    if (params.startDate && params.endDate) {
      where.createdAt = {
        [Op.between]: [new Date(params.startDate), new Date(params.endDate)],
      };
    }

    const { count, rows } = await SecurityLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
          // required:false 미지정 시 INNER JOIN으로 userId NULL 행(익명 시스템 이벤트)이
          // 페이지네이션 total에서 누락됨
          required: false,
        },
      ],
    });

    return {
      logs: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  }

  /**
   * 오래된 보안 로그 자동 삭제
   * @param retentionDays 보존 기간 (기본 90일)
   * @returns 삭제된 로그 수
   */
  async deleteOldLogs(retentionDays = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await SecurityLog.destroy({
      where: {
        createdAt: { [Op.lt]: cutoffDate },
      },
    });
    return deleted;
  }

  /**
   * 선택적 조건으로 보안 로그 일괄 삭제
   * @param options.before 특정 날짜 이전 로그만 삭제
   * @param options.ids 특정 ID 목록만 삭제 (지정 시 before 무시)
   * @returns 삭제된 로그 수
   */
  async deleteLogs(options: { before?: string; ids?: string[] } = {}): Promise<number> {
    const where: any = {};

    if (Array.isArray(options.ids)) {
      // 빈 배열은 no-op으로 처리 (accidental delete-all 방지)
      if (options.ids.length === 0) return 0;
      where.id = { [Op.in]: options.ids };
    } else if (options.before) {
      where.createdAt = { [Op.lt]: new Date(options.before) };
    } else {
      // 조건 없으면 전체 삭제 — truncate 대신 destroy로 훅 정상 실행
      return SecurityLog.destroy({ where: {} });
    }

    return SecurityLog.destroy({ where });
  }

  /** 전체 보안 로그 삭제 */
  async deleteAll(): Promise<number> {
    return SecurityLog.destroy({ where: {} });
  }
}

export const securityLogService = new SecurityLogService();
