import { BaseService } from './base.service';
import { LoginHistory } from '../models/LoginHistory';
import { Op } from 'sequelize';
import { logError } from '../utils/logger';
import { clampText } from '../utils/clamp';

interface CreateLoginRecordDTO {
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  status: 'success' | 'failed' | 'locked';
  failureReason?: string | null;
}

interface GetLoginHistoryDTO {
  userId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export class LoginHistoryService extends BaseService {
  /**
   * 로그인 이력 생성 (fire-and-forget)
   */
  async createLoginRecord(data: CreateLoginRecordDTO): Promise<void> {
    try {
      await LoginHistory.create({
        ...data,
        // userId 에는 요청자가 보낸 아이디가 들어올 수 있어 다른 로그 서비스와 같게 잘라 둔다.
        userId: clampText(data.userId, 50),
        userName: clampText(data.userName, 100),
        userRole: clampText(data.userRole, 50),
        ipAddress: clampText(data.ipAddress, 45),
        failureReason: clampText(data.failureReason, 500),
        userAgent: data.userAgent?.substring(0, 500) ?? null,
      });
    } catch (error) {
      logError('로그인 이력 저장 실패', error);
    }
  }

  async getLoginHistory(params: GetLoginHistoryDTO) {
    const page = Math.min(Math.max(params.page || 1, 1), 10000);
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (params.userId) {
      where.userId = params.userId;
    }

    if (params.status && ['success', 'failed', 'locked'].includes(params.status)) {
      where.status = params.status;
    }

    const toDate = (s: string): Date | null => {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };
    const startDate = params.startDate ? toDate(params.startDate) : null;
    const endDate = params.endDate ? toDate(params.endDate) : null;
    // 종료일을 날짜만(YYYY-MM-DD) 지정한 경우 해당 일자 끝까지 포함 (당일 누락 방지)
    if (endDate && params.endDate && /^\d{4}-\d{2}-\d{2}$/.test(params.endDate.trim())) {
      endDate.setUTCHours(23, 59, 59, 999);
    }

    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      where.createdAt = { [Op.gte]: startDate };
    } else if (endDate) {
      where.createdAt = { [Op.lte]: endDate };
    }

    const { count, rows } = await LoginHistory.findAndCountAll({
      where,
      limit,
      offset,
      // 시각이 같으면 id 로 가른다 — 없으면 페이지 경계에서 행이 중복·누락된다.
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
    });

    return {
      records: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  }

  async deleteOldRecords(retentionDays = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return LoginHistory.destroy({
      where: { createdAt: { [Op.lt]: cutoffDate } },
    });
  }
}

export const loginHistoryService = new LoginHistoryService();
