import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { shouldRetryQuery } from '../api/retryPolicy';
import { useAuth } from '../store/auth';

interface QueryProviderProps {
  children: ReactNode;
}

export const QueryProvider = ({ children }: QueryProviderProps) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  // 캐시 키에 사용자 구분이 없어, 로그인한 사람이 바뀌면 캐시를 전부 비운다.
  const userId = useAuth(s => s.user?.id ?? null);
  const seen = useRef(userId);
  useEffect(() => {
    if (seen.current === userId) return;
    seen.current = userId;
    queryClient.clear();
  }, [userId, queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
