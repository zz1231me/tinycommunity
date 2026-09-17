// server/src/utils/pagePayload.ts
// 페이지네이션 응답 모양을 한 곳에서 만든다.
// 클라이언트 PaginationInfo 는 hasNextPage/hasPrevPage 로 이전·다음 버튼을 잠그므로,
// 목록마다 손으로 조립하면 한 곳만 빠뜨려도 버튼이 영영 비활성으로 남는다.

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
