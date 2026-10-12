// 보기 설정을 계정에 저장한다.
//
// 지금까지 localStorage 에만 있어서 기기를 바꾸면 초기화됐다. 서버에 옮기면서도
// 화면이 처음 그려질 때 '목록 → 칸반' 으로 튀지 않아야 해서 둘을 함께 쓴다.
// 그래서 지켜야 할 선은 ① 첫 그림은 로컬 값으로 ② 서버 값이 오면 맞춘다
// ③ 내가 방금 바꾼 값을 늦게 온 서버 응답이 뒤집지 않는다 ④ 서버 저장이 실패해도 막지 않는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUiPrefs } from './useUiPrefs';
import { useAuth } from '../store/auth';

const api = vi.hoisted(() => ({ fetchUiPrefs: vi.fn(), saveUiPrefs: vi.fn() }));
vi.mock('../api/uiPrefs', () => api);

const store = new Map<string, string>();
vi.mock('../utils/safeStorage', () => ({
  safeStorage: {
    get: (k: string) => store.get(k) ?? null,
    set: (k: string, v: string) => void store.set(k, v),
    remove: (k: string) => void store.delete(k),
  },
}));

const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useUiPrefs(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  useAuth.setState({ isAuthenticated: true });
  api.fetchUiPrefs.mockResolvedValue({});
  api.saveUiPrefs.mockImplementation(async (patch: unknown) => patch);
});

describe('보기 설정', () => {
  it('지난번 값이 로컬에 있으면 첫 그림부터 그 값이다 — 화면이 튀지 않게', () => {
    store.set('myhome-ui-prefs', JSON.stringify({ taskView: 'kanban' }));
    const { result } = show();

    expect(result.current.prefs.taskView).toBe('kanban');
  });

  it('서버 값이 오면 그것으로 맞춘다', async () => {
    api.fetchUiPrefs.mockResolvedValue({ taskView: 'gantt', taskSort: 'priority' });
    const { result } = show();

    await waitFor(() => expect(result.current.prefs.taskView).toBe('gantt'));
    expect(result.current.prefs.taskSort).toBe('priority');
  });

  it('바꾸면 서버에 그 키만 보낸다', async () => {
    const { result } = show();
    await act(async () => result.current.setPref('taskSort', 'due'));
    expect(api.saveUiPrefs).toHaveBeenCalledWith({ taskSort: 'due' });
    expect(result.current.prefs.taskSort).toBe('due');
  });

  it('바꾼 값은 로컬에도 남는다 — 다음에 열 때 바로 쓴다', async () => {
    const { result } = show();
    await act(async () => result.current.setPref('taskView', 'kanban'));

    expect(JSON.parse(store.get('myhome-ui-prefs') ?? '{}')).toEqual({ taskView: 'kanban' });
  });

  it('서버 저장이 실패해도 화면 값은 남는다', async () => {
    api.saveUiPrefs.mockRejectedValue(new Error('끊김'));
    const { result } = show();

    await act(async () => result.current.setPref('taskView', 'gantt'));

    expect(result.current.prefs.taskView).toBe('gantt');
  });

  it('방금 바꾼 값을 늦게 온 서버 응답이 되돌리지 않는다', async () => {
    // 저장이 먼저 끝나고 조회 응답이 나중에 닿는 순서. 예전 구현은 여기서 옛 값으로 돌아갔다.
    let resolveFetch: (v: unknown) => void = () => {};
    api.fetchUiPrefs.mockImplementation(
      () =>
        new Promise(res => {
          resolveFetch = res as (v: unknown) => void;
        })
    );
    const { result } = show();

    await act(async () => result.current.setPref('taskView', 'kanban'));
    await act(async () => {
      resolveFetch({ taskView: 'list', taskSort: 'due' });
    });

    expect(result.current.prefs.taskView).toBe('kanban'); // 내가 바꾼 것은 남고
    await waitFor(() => expect(result.current.prefs.taskSort).toBe('due')); // 나머지는 서버 값
  });

  it('로그인하지 않았으면 서버에 묻지 않는다', () => {
    useAuth.setState({ isAuthenticated: false });
    show();

    expect(api.fetchUiPrefs).not.toHaveBeenCalled();
  });

  it('깨진 로컬 값은 빈 값으로 읽는다', () => {
    store.set('myhome-ui-prefs', '{부서짐');
    const { result } = show();

    expect(result.current.prefs).toEqual({});
  });
});
