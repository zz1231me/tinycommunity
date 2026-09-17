// client/src/test/renderWithQuery.tsx
// React Query 를 쓰는 컴포넌트용 렌더 헬퍼.
// 테스트마다 새 QueryClient 를 만들어 캐시가 테스트 간에 새지 않게 하고,
// retry 를 꺼서 실패 케이스가 3번 재시도되며 느려지지 않게 한다.

import { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}
