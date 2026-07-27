// server/src/services/base.service.ts
// 모든 서비스 클래스의 공통 기반 — 페이지네이션, 로깅, 에러 처리 헬퍼 제공

import { logError } from '../utils/logger';
import { PAGINATION } from '../config/constants';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
}

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export abstract class BaseService {
  /**
   * 페이지네이션 파라미터를 안전하게 정규화
   */
  protected buildPagination(params: PaginationParams): PaginationResult {
    const page = Math.max(1, params.page ?? PAGINATION.DEFAULT_PAGE);
    const limit = Math.min(
      Math.max(1, params.limit ?? PAGINATION.DEFAULT_LIMIT),
      PAGINATION.MAX_LIMIT
    );
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  /**
   * Sequelize findAndCountAll 결과를 페이지 응답 형태로 변환
   */
  protected buildPagedResponse<T>(
    rows: T[],
    total: number,
    pagination: PaginationResult
  ): PagedResponse<T> {
    const { page, limit } = pagination;
    const totalPages = Math.ceil(total / limit);
    return {
      items: rows,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * 에러를 로깅하고 re-throw
   */
  protected handleError(error: unknown, context?: string): never {
    logError(context ?? '서비스 오류', error);
    throw error;
  }

  /**
   * JSON 문자열을 안전하게 파싱 (실패 시 기본값 반환)
   */
  protected safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as T;
      return parsed;
    } catch {
      logError('JSON 파싱 실패', { raw: raw.slice(0, 100) });
      return fallback;
    }
  }
}
