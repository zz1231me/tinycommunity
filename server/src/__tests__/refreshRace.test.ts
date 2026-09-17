// server/src/__tests__/refreshRace.test.ts
// 탭 여러 개가 동시에 토큰을 갱신할 때 로그아웃되지 않는지.
//
// 브라우저의 쿠키 저장소는 탭끼리 하나다. 액세스 토큰이 만료된 뒤 탭 두 개가 같은
// refresh 쿠키로 거의 동시에 갱신을 부르면, 서버는 한 세션을 두 번 회전시키고
// 브라우저에는 나중에 도착한 응답의 쿠키가 남는다. 그 쿠키를 DB 가 모르면
// 다음 갱신에서 로그인 화면으로 튕긴다.

import request from 'supertest';
import { app, seedTestData, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import { UserSession } from '../models/UserSession';

const PASSWORD = 'TestUser123!';

function cookieOf(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map(c => c.split(';')[0]).join('; ');
}

const refresh = (cookie: string) =>
  request(app).post('/api/auth/refresh').set(CSRF_HEADER).set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  if (!(await User.findByPk('raceuser'))) {
    await User.create({
      id: 'raceuser',
      password: PASSWORD,
      name: '갱신경쟁',
      email: 'race@test.com',
      roleId: 'user',
      isActive: true,
    });
  }
});

beforeEach(async () => {
  await UserSession.destroy({ where: { userId: 'raceuser' }, force: true });
});

async function login(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ id: 'raceuser', password: PASSWORD });
  expect(res.status).toBe(200);
  return cookieOf(res);
}

describe('동시 갱신', () => {
  it('같은 쿠키로 동시에 갱신해도 어느 응답의 쿠키가 남든 다음 갱신이 통한다', async () => {
    const cookie = await login();
    const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // 브라우저에는 둘 중 하나가 남는다 — 어느 쪽이어도 이어서 쓸 수 있어야 한다
    for (const res of [a, b]) {
      const next = cookieOf(res) || cookie;
      expect((await refresh(next)).status).toBe(200);
    }
  });

  it('조금 늦게 도착한 옛 쿠키 갱신도 통한다', async () => {
    // 한 탭이 회전을 끝낸 직후, 옛 쿠키를 들고 출발했던 다른 탭의 요청이 도착하는 경우
    const cookie = await login();
    const first = await refresh(cookie);
    expect(first.status).toBe(200);
    const late = await refresh(cookie);
    expect(late.status).toBe(200);
    expect((await refresh(cookieOf(late) || cookie)).status).toBe(200);
  });

  it('동시 갱신이 세션을 늘리지 않는다', async () => {
    const cookie = await login();
    await Promise.all([refresh(cookie), refresh(cookie), refresh(cookie)]);
    const active = await UserSession.count({ where: { userId: 'raceuser', isActive: true } });
    expect(active).toBe(1);
  });

  it('유예는 짧다 — 한참 지난 옛 쿠키는 거절한다', async () => {
    const cookie = await login();
    expect((await refresh(cookie)).status).toBe(200);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(Date.now() + 5 * 60_000);
    try {
      expect((await refresh(cookie)).status).toBe(401);
    } finally {
      jest.useRealTimers();
    }
  });
});
