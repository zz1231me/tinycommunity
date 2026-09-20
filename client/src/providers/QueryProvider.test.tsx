// client/src/providers/QueryProvider.test.tsx
//
// 사람이 바뀌면 받아 둔 답을 버리는가.
//
// 로그아웃은 새로고침 없이 화면만 바꾸고, 캐시 열쇠에는 누구의 것인지가 없다(['attendance','me']).
// 5분은 '신선한' 것으로 쳐서 다시 묻지도 않으므로, 버리지 않으면 같은 브라우저에서 바로
// 로그인한 다음 사람에게 앞 사람의 출퇴근 상태·쪽지 수·스크랩이 그대로 보인다.

import { describe, expect, it, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryProvider } from './QueryProvider';
import { useAuth } from '../store/auth';
import { attendanceKeys } from '../api/queryKeys';

let client: ReturnType<typeof useQueryClient>;

function Probe() {
  client = useQueryClient();
  return null;
}

const asUser = (id: string) =>
  ({ id, name: id, role: 'user', permissions: [] }) as unknown as Parameters<
    typeof useAuth.getState extends () => infer S
      ? S extends { setUser: infer F }
        ? F
        : never
      : never
  >[0];

beforeEach(() => {
  useAuth.setState({ user: null, isAuthenticated: false });
});

describe('사람이 바뀌면 받아 둔 답을 버린다', () => {
  it('로그아웃하면 앞 사람의 답이 남지 않는다', () => {
    useAuth.setState({ user: asUser('alice'), isAuthenticated: true });
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>
    );
    act(() => {
      client.setQueryData(attendanceKeys.me, { who: 'alice' });
    });
    expect(client.getQueryData(attendanceKeys.me)).toEqual({ who: 'alice' });

    act(() => {
      useAuth.setState({ user: null, isAuthenticated: false });
    });

    expect(client.getQueryData(attendanceKeys.me)).toBeUndefined();
  });

  it('다른 사람으로 바로 로그인해도 앞 사람의 답을 쓰지 않는다', () => {
    useAuth.setState({ user: asUser('alice'), isAuthenticated: true });
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>
    );
    act(() => {
      client.setQueryData(attendanceKeys.me, { who: 'alice' });
    });

    act(() => {
      useAuth.setState({ user: asUser('bob'), isAuthenticated: true });
    });

    expect(client.getQueryData(attendanceKeys.me)).toBeUndefined();
  });

  it('같은 사람이면 버리지 않는다 — 토큰만 새로 받았을 때 화면이 비지 않게', () => {
    useAuth.setState({ user: asUser('alice'), isAuthenticated: true });
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>
    );
    act(() => {
      client.setQueryData(attendanceKeys.me, { who: 'alice' });
    });

    act(() => {
      useAuth.setState({ user: asUser('alice'), isAuthenticated: true });
    });

    expect(client.getQueryData(attendanceKeys.me)).toEqual({ who: 'alice' });
  });
});
