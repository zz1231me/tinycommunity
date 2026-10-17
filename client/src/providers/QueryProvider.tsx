import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { shouldRetryQuery } from '../api/retryPolicy';
import { useAuth } from '../store/auth';
import { clearUiPrefsCache } from '../hooks/useUiPrefs';

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
  // 이 탭에서 누구인지가 바뀐 적이 있는지. '앱을 여는 중' 과 '사람이 바뀌는 중' 을 가른다.
  const firstResolve = useRef(true);
  useEffect(() => {
    if (seen.current === userId) return;
    const before = seen.current;
    seen.current = userId;
    const opening = firstResolve.current;
    firstResolve.current = false;
    // 앱을 열 때는 누구인지 모르는 상태(null)로 시작해 /auth/me 가 오면 채워진다. 그 한 번만
    // 넘긴다 — 방금 열린 탭이라 비워야 할 남의 답이 없는데, 버리면 그 사이 받아 둔 답
    // (출퇴근 상태 등)을 곧바로 다시 묻는다.
    //
    // '처음 한 번' 으로 좁히는 것이 중요하다. 로그아웃(A -> null)으로 한 번 비운 뒤 다른
    // 사람이 그 탭에서 바로 로그인하면 그것도 null -> 사용자 지만, 그 사이 늦게 도착한 A 의
    // 응답이 캐시에 앉을 수 있다. 캐시 열쇠에 누구의 것인지가 없으므로 그때는 비워야 한다.
    if (opening && before === null) return;
    queryClient.clear();
    // 보기 설정은 첫 그림이 튀지 않게 localStorage 에도 남겨 둔다. 거기에는 누구 것인지가
    // 없으므로 함께 버린다 — 아니면 다음 사람이 앞사람의 보기·정렬로 열린다.
    clearUiPrefsCache();
  }, [userId, queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
