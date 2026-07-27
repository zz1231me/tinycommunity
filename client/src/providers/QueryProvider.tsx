// client/src/providers/QueryProvider.tsx - React Query Provider
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

interface QueryProviderProps {
  children: ReactNode;
}

export const QueryProvider = ({ children }: QueryProviderProps) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 5분 동안 데이터 신선하게 유지
            staleTime: 5 * 60 * 1000,
            // 30분 후 캐시 삭제
            gcTime: 30 * 60 * 1000,
            // 실패 시 3번 재시도
            retry: 3,
            // 창 포커스 시 자동 refetch 비활성화
            refetchOnWindowFocus: false,
          },
          mutations: {
            // 뮤테이션 실패 시 재시도 없음
            retry: 0,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
