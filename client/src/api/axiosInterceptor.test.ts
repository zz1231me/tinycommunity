// client/src/api/axiosInterceptor.test.ts
// 세션이 끊길 때 무엇을 하는가 — axios 응답 인터셉터.
//
// 이 파일이 다루는 로직은 지금까지 테스트가 하나도 없었다. retryPolicy.test.ts 는
// React Query 의 재시도 판정(shouldRetryQuery)을 덮을 뿐 인터셉터와 무관하다.
//
// 여기서 잘못되면 증상이 조용하다. 419 를 401 처럼 다루면 새로고침마다 로그아웃되고,
// 반대로 401 에서 안 내보내면 만료된 화면에 남아 계속 실패한다. 비밀글 비밀번호를
// 틀렸을 뿐인데 로그인 화면으로 튕기거나, 평범한 권한 거부에 /forbidden 으로 보내는 것도
// 같은 부류다.
//
// isRefreshing·refreshSubscribers 가 모듈 수준 가변 상태라, 테스트마다 모듈을 새로
// 불러 격리한다. 안 그러면 앞 테스트의 잔재가 뒤 테스트의 결과를 바꾼다.

import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';

const { mockRefreshToken } = vi.hoisted(() => ({ mockRefreshToken: vi.fn() }));
vi.mock('./auth', () => ({ refreshToken: mockRefreshToken }));

// ReturnType<typeof vi.fn> 로 두면 Mock<Procedure | Constructable> 로 풀려 호출할 수 없다
// (TS2348). 스파이를 직접 부르는 자리가 있으므로 시그니처를 박아 둔다.
let hrefSpy: Mock<(v: string) => void>;
let realLocation: PropertyDescriptor | undefined;

/** 매번 새 모듈 인스턴스를 얻는다 (isRefreshing 등 모듈 상태 격리) */
async function freshApi(): Promise<AxiosInstance> {
  vi.resetModules();
  const mod = await import('./axios');
  return mod.default;
}

/**
 * 응답을 흉내 낸다.
 *
 * 커스텀 어댑터는 settle 을 거치지 않는다 — 4xx 로 resolve 하면 axios 가 성공으로 본다.
 * (첫 판에서 이걸 몰라 12개가 헛돌았다.) 그래서 상태에 맞춰 직접 AxiosError 로 거절한다.
 */
function respond(config: AxiosRequestConfig, status: number, data: unknown) {
  const response = { data, status, statusText: '', headers: {}, config } as never;
  if (status >= 400) {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      String(status),
      config as never,
      undefined,
      response
    );
  }
  return response;
}

function queueResponses(api: AxiosInstance, statuses: Array<{ status: number; data?: unknown }>) {
  let i = 0;
  const calls: string[] = [];
  api.defaults.adapter = async config => {
    calls.push(config.url ?? '');
    const next = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    return respond(config, next.status, next.data ?? {});
  };
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(localStorage.getItem).mockReturnValue(null);

  // 리다이렉트를 실제 이동 없이 관찰한다
  realLocation = Object.getOwnPropertyDescriptor(window, 'location');
  hrefSpy = vi.fn<(v: string) => void>();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return '';
      },
      set href(v: string) {
        hrefSpy(v);
      },
    },
  });
});

afterEach(() => {
  if (realLocation) Object.defineProperty(window, 'location', realLocation);
});

describe('정상 응답', () => {
  it('2xx 는 건드리지 않고 그대로 통과시킨다', async () => {
    const api = await freshApi();
    queueResponses(api, [{ status: 200, data: { ok: true } }]);

    const res = await api.get('/anything');

    expect(res.status).toBe(200);
    expect(hrefSpy).not.toHaveBeenCalled();
    expect(mockRefreshToken).not.toHaveBeenCalled();
  });
});

describe('419 — 다시 발급받으면 되는 상태', () => {
  it('토큰을 갱신하고 원래 요청을 다시 보낸다', async () => {
    const api = await freshApi();
    mockRefreshToken.mockResolvedValue({ data: {} });
    const calls = queueResponses(api, [{ status: 419 }, { status: 200, data: { ok: true } }]);

    const res = await api.get('/api/posts/notice');

    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(calls).toEqual(['/api/posts/notice', '/api/posts/notice']); // 재시도까지 두 번
    expect(hrefSpy).not.toHaveBeenCalled();
  });

  it('갱신이 실패하면 로그인 화면으로 보낸다', async () => {
    const api = await freshApi();
    mockRefreshToken.mockRejectedValue(new Error('refresh failed'));
    queueResponses(api, [{ status: 419 }]);

    await expect(api.get('/api/posts/notice')).rejects.toBeTruthy();

    expect(hrefSpy).toHaveBeenCalledWith('/');
  });

  it('앱을 열 때 부르는 /auth/me 는 갱신이 실패해도 내보내지 않는다', async () => {
    const api = await freshApi();
    mockRefreshToken.mockRejectedValue(new Error('refresh failed'));
    queueResponses(api, [{ status: 419 }]);

    await expect(api.get('/auth/me')).rejects.toBeTruthy();

    // 여기서 내보내면 만료된 세션으로 새로고침할 때마다 로그인 화면으로 튕긴다
    expect(hrefSpy).not.toHaveBeenCalled();
  });

  it('재시도한 요청이 또 419 여도 갱신을 두 번 시도하지 않는다', async () => {
    const api = await freshApi();
    mockRefreshToken.mockResolvedValue({ data: {} });
    queueResponses(api, [{ status: 419 }, { status: 419 }]);

    await expect(api.get('/api/posts/notice')).rejects.toBeTruthy();

    // _retry 가드가 없으면 무한히 갱신을 시도한다
    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('동시에 419 를 받아도 갱신은 한 번만 한다', async () => {
    const api = await freshApi();
    let resolveRefresh: (v: unknown) => void = () => {};
    mockRefreshToken.mockReturnValue(
      new Promise(resolve => {
        resolveRefresh = resolve;
      })
    );
    const statuses = [{ status: 419 }, { status: 419 }, { status: 200 }];
    let i = 0;
    api.defaults.adapter = async config => {
      const next = statuses[Math.min(i, statuses.length - 1)];
      i += 1;
      return respond(config, next.status, {});
    };

    const a = api.get('/api/a');
    const b = api.get('/api/b');
    await Promise.resolve();
    resolveRefresh({ data: {} });
    await Promise.allSettled([a, b]);

    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
  });
});

describe('401 — 정말 끝난 세션', () => {
  it('로그인 화면으로 보낸다', async () => {
    const api = await freshApi();
    queueResponses(api, [{ status: 401 }]);

    await expect(api.get('/api/posts/notice')).rejects.toBeTruthy();

    expect(hrefSpy).toHaveBeenCalledWith('/');
  });

  it('/auth/me 에서는 내보내지 않는다', async () => {
    const api = await freshApi();
    queueResponses(api, [{ status: 401 }]);

    await expect(api.get('/auth/me')).rejects.toBeTruthy();

    expect(hrefSpy).not.toHaveBeenCalled();
  });

  it('비밀글 비밀번호 검증의 401 은 비밀번호가 틀린 것이지 세션 만료가 아니다', async () => {
    const api = await freshApi();
    queueResponses(api, [{ status: 401 }]);

    await expect(api.post('/api/posts/notice/5/verify')).rejects.toBeTruthy();

    // 여기서 내보내면 비밀번호 한 번 틀렸다고 로그인 화면으로 튕긴다
    expect(hrefSpy).not.toHaveBeenCalled();
  });

  it('로그인한 적 있을 때만 만료 안내를 남긴다', async () => {
    const api = await freshApi();
    vi.mocked(localStorage.getItem).mockReturnValue('{"accessTokenExpiry":1}');
    queueResponses(api, [{ status: 401 }]);

    await expect(api.get('/api/posts/notice')).rejects.toBeTruthy();

    expect(sessionStorage.getItem('session_expired')).toBe('1');
  });

  it('비로그인 방문자에게는 만료 안내를 남기지 않는다', async () => {
    const api = await freshApi();
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    queueResponses(api, [{ status: 401 }]);

    await expect(api.get('/api/posts/notice')).rejects.toBeTruthy();

    expect(sessionStorage.getItem('session_expired')).toBeNull();
  });
});

describe('403 — 세션 무효와 평범한 권한 거부를 가른다', () => {
  it('비활성화된 계정이면 /forbidden 으로 보낸다', async () => {
    const api = await freshApi();
    queueResponses(api, [{ status: 403, data: { message: '비활성화된 계정입니다.' } }]);

    await expect(api.get('/api/posts/notice')).rejects.toBeTruthy();

    expect(hrefSpy).toHaveBeenCalledWith('/forbidden');
  });

  it('평범한 권한 거부는 화면이 처리하도록 두고 내보내지 않는다', async () => {
    const api = await freshApi();
    queueResponses(api, [{ status: 403, data: { message: '이 게시판에 글을 쓸 수 없습니다.' } }]);

    await expect(api.get('/api/posts/notice')).rejects.toBeTruthy();

    expect(hrefSpy).not.toHaveBeenCalled();
  });
});
