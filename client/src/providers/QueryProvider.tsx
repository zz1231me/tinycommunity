// client/src/providers/QueryProvider.tsx - React Query Provider
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
            // 5분 동안 데이터 신선하게 유지
            staleTime: 5 * 60 * 1000,
            // 30분 후 캐시 삭제
            gcTime: 30 * 60 * 1000,
            retry: shouldRetryQuery,
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

  // 사람이 바뀌면(로그아웃·다른 계정으로 로그인) 받아 둔 답을 전부 버린다.
  //
  // 로그아웃은 새로고침 없이 화면만 바꾸고, 캐시 열쇠에는 누구의 것인지가 없다(예: ['attendance','me']).
  // 게다가 5분은 '신선한' 것으로 쳐서 다시 묻지도 않는다 — 그래서 같은 브라우저에서 바로
  // 다른 사람이 로그인하면 앞 사람의 출퇴근 상태·안 읽은 쪽지 수·스크랩·임시저장이 그대로
  // 보였다. 화면 위쪽에 늘 떠 있는 출퇴근 알림은 앞 사람의 출근 시각으로 퇴근을 권하기까지 했다.
  const userId = useAuth(s => s.user?.id ?? null);
  const seen = useRef(userId);
  useEffect(() => {
    if (seen.current === userId) return;
    seen.current = userId;
    queryClient.clear();
  }, [userId, queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
