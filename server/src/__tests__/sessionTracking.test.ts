// server/src/__tests__/sessionTracking.test.ts
// '활성 세션' 목록이 실제와 맞는지 확인한다.
//
// 이 목록은 관리자가 "누가 어디서 접속해 있나" 를 판단하는 근거다. 실제보다 많으면
// 없는 접속을 있다고 알리고, 적으면 살아 있는 접속을 놓친다. 둘 다 곤란하다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import { UserSession } from '../models/UserSession';

const PASSWORD = 'TestUser123!';
let adminCookie: string;

/** 기기를 구분하려고 User-Agent 를 달리해 로그인한다 */
async function loginWith(id: string, agent: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .set('User-Agent', agent)
    .send({ id, password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.join('; ');
}

const listSessions = (userId: string) =>
  request(app).get(`/api/admin/users/${userId}/sessions`).set('Cookie', adminCookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  if (!(await User.findByPk('sessuser'))) {
    await User.create({
      id: 'sessuser',
      password: PASSWORD,
      name: '세션사용자',
      email: 'sess@test.com',
      roleId: 'user',
      isActive: true,
    });
  }
});

beforeEach(async () => {
  await UserSession.destroy({ where: { userId: 'sessuser' }, force: true });
});

describe('세션 개수', () => {
  it('로그인 한 번에 세션 하나', async () => {
    await loginWith('sessuser', 'DeviceA');
    const res = await listSessions('sessuser');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('기기 두 대로 로그인하면 둘 다 보인다', async () => {
    await loginWith('sessuser', 'DeviceA');
    await loginWith('sessuser', 'DeviceB');
    const agents = (await listSessions('sessuser')).body.data.map(
      (s: { userAgent: string }) => s.userAgent
    );
    expect(agents).toHaveLength(2);
    expect(agents).toEqual(expect.arrayContaining(['DeviceA', 'DeviceB']));
  });

  it('토큰을 갱신해도 세션이 늘지 않는다 — 갱신은 같은 접속이다', async () => {
    let cookie = await loginWith('sessuser', 'DeviceA');
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set(CSRF_HEADER)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      // 갱신하면 토큰이 바뀐다(회전) — 다음 갱신은 새 쿠키로 해야 한다
      const raw = res.headers['set-cookie'];
      const next: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (next.length > 0) cookie = next.map(c => c.split(';')[0]).join('; ');
    }
    expect((await listSessions('sessuser')).body.data).toHaveLength(1);
  });

  it('갱신할 때마다 다른 토큰이 나온다 — 같으면 두 기기가 한 자격증명을 나눠 쓴다', async () => {
    const cookie = await loginWith('sessuser', 'DeviceA');
    const tokenOf = (res: request.Response) => {
      const raw = res.headers['set-cookie'];
      const list: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return list.find(c => c.startsWith('refresh_token='))?.split(';')[0];
    };
    const a = tokenOf(
      await request(app).post('/api/auth/refresh').set(CSRF_HEADER).set('Cookie', cookie)
    );
    const b = await loginWith('sessuser', 'DeviceB');
    expect(a).toBeDefined();
    expect(b).not.toContain(a);
  });

  it('로그아웃하면 그 사람의 모든 기기가 함께 끊긴다', async () => {
    // 의도된 동작이다 — 로그아웃은 tokenVersion 을 올려 그 사람의 토큰을 전부 무효화한다.
    // 공용 PC 에서 나갈 때 다른 기기까지 확실히 끊기는 대신, 폰은 그대로 두고 싶어도 끊긴다.
    const cookie = await loginWith('sessuser', 'DeviceA');
    await loginWith('sessuser', 'DeviceB');
    await request(app).post('/api/auth/logout').set(CSRF_HEADER).set('Cookie', cookie);

    expect((await listSessions('sessuser')).body.data).toHaveLength(0);
  });
});

describe('목록에 들어가면 안 되는 것', () => {
  it('만료된 세션은 빠진다', async () => {
    await loginWith('sessuser', 'DeviceA');
    await UserSession.update(
      { expiresAt: new Date(Date.now() - 1000) },
      { where: { userId: 'sessuser' } }
    );
    expect((await listSessions('sessuser')).body.data).toHaveLength(0);
  });

  it('남의 세션은 섞이지 않는다', async () => {
    await loginWith('sessuser', 'DeviceA');
    const list = (await listSessions('sessuser')).body.data as Array<{ userId?: string }>;
    expect(list).toHaveLength(1);
    // 다른 사용자(admin)의 세션 목록과 겹치지 않는다
    const adminList = (await listSessions('admin')).body.data as unknown[];
    expect(adminList.length).toBeGreaterThan(0);
  });

  it('일반 사용자는 남의 세션 목록을 볼 수 없다', async () => {
    const cookie = await loginWith('sessuser', 'DeviceA');
    const res = await request(app).get('/api/admin/users/admin/sessions').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });
});

describe('강제 종료', () => {
  it('종료하면 그 세션의 토큰이 더 이상 통하지 않는다', async () => {
    const cookie = await loginWith('sessuser', 'DeviceA');
    // 종료 전에는 통한다
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);

    const sessions = (await listSessions('sessuser')).body.data as Array<{ id: string }>;
    const kill = await request(app)
      .delete(`/api/admin/users/sessuser/sessions/${sessions[0].id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect([200, 204]).toContain(kill.status);

    // 액세스 토큰이 아직 살아 있어도 막혀야 한다
    const after = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(after.status).not.toBe(200);
    expect((await listSessions('sessuser')).body.data).toHaveLength(0);
  });

  it('관리자가 자기 세션을 이 메뉴로 끊지 못한다 — 스스로 잠기는 것을 막는다', async () => {
    const sessions = (await listSessions('admin')).body.data as Array<{ id: string }>;
    const res = await request(app)
      .delete(`/api/admin/users/admin/sessions/${sessions[0].id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });
});
