import request from 'supertest';
import { app, seedTestData, CSRF_HEADER } from './helpers';

beforeAll(async () => {
  await seedTestData();
});

describe('POST /api/auth/login', () => {
  it('올바른 자격증명으로 로그인 성공', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: 'admin', password: 'TestAdmin123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toHaveProperty('id', 'admin');
    // 비밀번호는 응답에 포함되지 않아야 함
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('잘못된 비밀번호로 로그인 실패', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: 'admin', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('존재하지 않는 사용자로 로그인 실패', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: 'nonexistent', password: 'somepassword' });

    expect(res.status).toBe(401);
  });

  it('로그인 성공 시 httpOnly 쿠키 발급', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: 'admin', password: 'TestAdmin123!' });

    expect(res.status).toBe(200);
    const rawCookies = res.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies)
      ? rawCookies
      : rawCookies
        ? [rawCookies]
        : [];
    expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);
  });
});

describe('POST /api/auth/logout', () => {
  it('로그인 후 로그아웃 성공', async () => {
    // 로그인
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: 'admin', password: 'TestAdmin123!' });

    const rawCookies1 = loginRes.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies1)
      ? rawCookies1
      : rawCookies1
        ? [rawCookies1]
        : [];
    const cookieHeader = cookies.join('; ');

    // 로그아웃 (204 No Content)
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set(CSRF_HEADER)
      .set('Cookie', cookieHeader);

    expect(logoutRes.status).toBe(204);
  });
});

describe('GET /api/auth/me', () => {
  it('인증된 사용자 정보 조회', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: 'admin', password: 'TestAdmin123!' });

    const rawCookies2 = loginRes.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies2)
      ? rawCookies2
      : rawCookies2
        ? [rawCookies2]
        : [];

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies.join('; '));

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user).toHaveProperty('id', 'admin');
  });

  it('미인증 상태에서 /me 접근 시 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
