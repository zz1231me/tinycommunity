// 글을 쓰는 도중 세션이 끊기지 않는지 — 자동 연장이 실제로 가능한 상태인지 확인한다.
//
// access 쿠키의 수명을 토큰과 똑같이 잡으면, 토큰이 만료되는 순간 브라우저가 쿠키를
// 지워 다음 요청이 419(만료) 가 아니라 401(없음) 로 도착한다. 화면은 419 에서만 갱신을
// 시도하므로 refresh 토큰이 유효한데도 로그인 화면으로 튕긴다.
//
// 여기서 고정하는 것 두 가지:
//   1) access 쿠키는 토큰보다 오래 남는다 (만료 사실이 서버까지 도달해야 419 가 나온다)
//   2) 만료된 access 토큰을 들고 가면 401 이 아니라 419 가 돌아온다

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, seedTestData, loginAs, CSRF_HEADER, relaxRateLimits } from './helpers';
import { getSettings } from '../utils/settingsCache';
import User from '../models/User';

// 로그아웃은 그 계정의 tokenVersion 을 올려 기존 토큰을 전부 무효화한다.
// 그래서 여기서는 공용 admin 을 쓰지 않는다 — 다른 테스트 24개가 같은 계정으로 로그인해
// 두고 있어서, 이 파일이 admin 을 로그아웃시키면 그쪽 세션이 함께 끊긴다.
const USER = 'sessionuser';
const PASSWORD = 'Test1234!';

beforeAll(async () => {
  await seedTestData();
  await relaxRateLimits();
  if (!(await User.findByPk(USER))) {
    await User.create({
      id: USER,
      password: PASSWORD,
      name: '세션유저',
      email: `${USER}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
});

/** Set-Cookie 한 줄에서 Max-Age 를 초 단위로 뽑는다 */
function maxAgeOf(cookies: string[], name: string): number | null {
  const line = cookies.find(c => c.startsWith(`${name}=`));
  if (!line) return null;
  const m = /max-age=(\d+)/i.exec(line);
  return m ? Number(m[1]) : null;
}

describe('세션 자동 연장', () => {
  // 로그인 한 번을 나눠 쓴다. 테스트마다 새로 로그인하면 그때마다 로그인 이력·세션·출석
  // 기록이 쌓여, 여러 스위트를 동시에 돌릴 때 SQLite 쓰기 경합만 늘린다.
  // 로그아웃 테스트만 자기 몫을 따로 받는다 — 그 쿠키를 무효화해야 하기 때문이다.
  let shared: string;
  let sharedRefresh: string;

  beforeAll(async () => {
    shared = await loginAs(USER, PASSWORD);
    sharedRefresh = shared
      .split('; ')
      .find(c => c.startsWith('refresh_token='))!
      .split(';')[0];
  });

  it('access 쿠키가 토큰 수명보다 오래 남는다', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: USER, password: PASSWORD });
    expect(res.status).toBe(200);

    const raw = res.headers['set-cookie'];
    const cookies: string[] = Array.isArray(raw) ? raw : [raw];
    const access = maxAgeOf(cookies, 'access_token');
    const refresh = maxAgeOf(cookies, 'refresh_token');
    const { jwtAccessTokenHours } = getSettings();

    expect(access).not.toBeNull();
    expect(refresh).not.toBeNull();
    // 토큰 자체 수명보다 길어야 만료 사실이 서버까지 도달한다
    expect(access!).toBeGreaterThan(jwtAccessTokenHours * 3600);
    // 갱신이 가능한 동안은 남아 있어야 한다
    expect(access).toBe(refresh);
  });

  it('만료된 access 토큰은 401 이 아니라 419 로 돌려준다', async () => {
    const refreshCookie = sharedRefresh;

    // 이미 만료된 access 토큰을 손으로 만든다
    const expired = jwt.sign({ id: USER, tv: 0 }, process.env.JWT_SECRET!, {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`access_token=${expired}`, refreshCookie]);

    // 419 여야 화면이 "갱신하고 다시 시도" 로 이어 간다. 401 이면 그대로 로그아웃된다.
    expect(res.status).toBe(419);
  });

  it('419 를 받은 뒤 갱신하면 원래 요청이 다시 통한다', async () => {
    const refreshCookie = sharedRefresh;

    const renewed = await request(app)
      .post('/api/auth/refresh')
      .set(CSRF_HEADER)
      .set('Cookie', [refreshCookie]);
    expect(renewed.status).toBe(200);

    const raw = renewed.headers['set-cookie'];
    const fresh: string[] = Array.isArray(raw) ? raw : [raw];
    const newAccess = fresh.find(c => c.startsWith('access_token='))!.split(';')[0];

    const retried = await request(app).get('/api/auth/me').set('Cookie', [newAccess]);
    expect(retried.status).toBe(200);
  });

  // 쿠키를 오래 남기기로 했으니, 로그아웃 뒤에도 그 쿠키가 통하면 안 된다.
  // (서버는 tokenVersion 을 올려 기존 토큰을 무효화한다 — 그 방어선이 실제로 도는지 확인)
  it('로그아웃하면 남아 있던 access 토큰이 통하지 않는다', async () => {
    const cookie = await loginAs(USER, PASSWORD);
    const before = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(before.status).toBe(200);

    const out = await request(app).post('/api/auth/logout').set(CSRF_HEADER).set('Cookie', cookie);
    expect(out.status).toBe(204);

    // 브라우저가 쿠키를 지우지 않았다고 가정하고 그대로 다시 보낸다
    const after = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(after.status).not.toBe(200);
  });

  // 화면은 419 만 보고 갱신을 시도한다. 그래서 "갱신하면 되는 상태" 와 "끝난 세션" 을
  // 서버가 상태 코드로 갈라 줘야 한다 — 응답 문구로 판단하게 두면 문구가 바뀌는 순간
  // 세션이 조용히 끊기기 시작한다.
  it('access 쿠키가 없어도 refresh 쿠키가 있으면 419 (갱신 유도)', async () => {
    const refreshCookie = sharedRefresh;

    const res = await request(app).get('/api/auth/me').set('Cookie', [refreshCookie]);
    expect(res.status).toBe(419);
  });

  it('둘 다 없으면 401 (끝난 세션)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
