import { BaseService } from './base.service';
import { AuditLog, AuditAction, AuditTargetType } from '../models/AuditLog';
import { Op } from 'sequelize';
import { logError } from '../utils/logger';
import { clampText, clampJson } from '../utils/clamp';

/** beforeValue/afterValue(JSON) 한 건의 상한. 넘으면 크기만 남기고 자른다. */
const VALUE_MAX_CHARS = 8000;

interface CreateAuditLogDTO {
  actorId: string;
  actorName: string;
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
  actorId?: string;
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
      // 컬럼 폭에 맞춰 자른 뒤 넣는다. 지금까지는 관리자 화면이 넘기는 값뿐이라 넘칠 일이
      // 없었지만, 일반 사용자의 삭제를 남기면서 targetName 에 글 제목·댓글 발췌가 들어온다.
      // 제목 상한(255)이 targetName 컬럼(200)보다 커서 그대로 두면 넘긴다 — MySQL·PostgreSQL
      // 에서는 INSERT 가 거부되고, 아래 catch 가 삼켜 기록만 사라진다.
      await AuditLog.create({
        ...data,
        actorId: clampText(data.actorId, 50),
        actorName: clampText(data.actorName, 100),
        targetId: clampText(data.targetId, 100),
        targetName: clampText(data.targetName, 200),
        ipAddress: clampText(data.ipAddress, 45),
        beforeValue: clampJson(data.beforeValue, VALUE_MAX_CHARS),
        afterValue: clampJson(data.afterValue, VALUE_MAX_CHARS),
      });
    } catch (error) {
      logError('감사 로그 저장 실패', error);
    }
  }

  /**
   * 감사 로그 조회
   */
  async getAuditLogs(params: GetAuditLogsDTO) {
    // 위쪽 상한이 없으면 page=99999999 요청 하나로 거대한 OFFSET 스캔과 COUNT(*) 가 함께 돈다.
    // 형제들은 모두 막아 두었다 — utils/pagination 은 maxPage 1000, loginHistory 는 10000.
    const page = Math.min(1000, Math.max(1, params.page || 1));
    const limit = Math.min(params.limit || 20, 100);
    const offset = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (params.actorId) {
      where.actorId = params.actorId;
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
      // 시각이 같으면 id 로 가른다 — 없으면 페이지 경계에서 행이 중복·누락된다.
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
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
