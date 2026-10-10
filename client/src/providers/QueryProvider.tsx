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
    const before = seen.current;
    seen.current = userId;
    // 앱을 열 때는 누구인지 모르는 상태(null)로 시작해 /auth/me 가 오면 채워진다. 그것까지
    // '사람이 바뀌었다' 로 보면 매번 캐시를 통째로 버려, 그 사이 받아 둔 답(출퇴근 상태 등)을
    // 곧바로 다시 묻는다. 비워야 할 남의 답은 애초에 없다 — 방금 열린 탭이니까.
    if (before === null) return;
    queryClient.clear();
  }, [userId, queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
