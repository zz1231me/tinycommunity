import { Request } from 'express';
import { getSettings } from './settingsCache';

interface PaginationOptions {
  defaultLimit?: number;
  maxPage?: number;
  maxLimit?: number;
}

/**
 * query.page / query.limit을 안전하게 파싱·범위 제한
 */
export function parsePagination(req: Request, options: PaginationOptions = {}) {
  const { defaultLimit = getSettings().defaultPageSize, maxPage = 1000, maxLimit = 100 } = options;

  const page = Math.min(maxPage, Math.max(1, parseInt(req.query.page as string) || 1));
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(req.query.limit as string) || defaultLimit)
  );

  return { page, limit, offset: (page - 1) * limit };
}
