// 페이지네이션 응답 모양을 한 곳에서 만든다.

export interface PaginationPayload {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function buildPagination(
  page: number,
  limit: number,
  totalCount: number
): PaginationPayload {
  const totalPages = Math.ceil(totalCount / limit);
  return {
    currentPage: page,
    totalPages,
    totalCount,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
