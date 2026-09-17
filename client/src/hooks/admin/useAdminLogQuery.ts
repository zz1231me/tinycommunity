import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminKeys } from '../../api/queryKeys';

export interface LogPage<T> {
  items: T[];
  total: number;
  totalPages: number;
}

interface Options<T> {
  /** 캐시 키에 쓰이는 로그 종류 식별자 (security · audit · login · error) */
  kind: string;
  /** 빈 문자열은 자동으로 제외된다 — 각 탭이 필터 이름을 그대로 넘기면 된다 */
  filters: Record<string, string | undefined>;
  /**
   * 응답 모양이 로그마다 달라서(logs/records, totalPages/pagination.totalPages)
   * 정규화는 호출부가 맡는다.
   */
  fetcher: (params: Record<string, string | number>, signal: AbortSignal) => Promise<LogPage<T>>;
  limit?: number;
}

/**
 * 관리자 로그 4종(보안·감사·로그인·에러)이 공유하는 조회 로직.
 *
 * 기존에는 각 탭이 useState 5~6개 + useCallback + AbortController useEffect 를
 * 손으로 반복했다. React Query 가 요청 취소(signal)·경쟁 조건·페이지 전환 시
 * 깜빡임(placeholderData)을 모두 처리하므로 그 보일러플레이트가 사라진다.
 */
export function useAdminLogQuery<T>({ kind, filters, fetcher, limit = 20 }: Options<T>) {
  const [page, setPage] = useState(1);

  // 빈 값은 쿼리 파라미터에서 제외 — 캐시 키도 이 정규화된 형태로 만들어진다.
  const activeFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) activeFilters[key] = value;
  }

  // 필터가 바뀌면 첫 페이지로. (예: 3페이지를 보다 검색어를 넣으면 결과가 1페이지뿐일 수 있다)
  const filterSignature = JSON.stringify(activeFilters);
  useEffect(() => {
    setPage(1);
  }, [filterSignature]);

  const query = useQuery({
    queryKey: adminKeys.logs.list(kind, { ...activeFilters, page, limit }),
    queryFn: ({ signal }) => fetcher({ ...activeFilters, page, limit }, signal),
    // 페이지를 넘길 때 목록이 빈 화면으로 깜빡이지 않도록 이전 페이지를 유지
    placeholderData: keepPreviousData,
  });

  const totalPages = query.data?.totalPages ?? 1;

  return {
    records: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    totalPages,
    loading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    page,
    setPage,
    goPrev: () => setPage(p => Math.max(1, p - 1)),
    goNext: () => setPage(p => Math.min(totalPages, p + 1)),
  };
}
