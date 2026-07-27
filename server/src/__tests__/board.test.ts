import request from 'supertest';
import { app, seedTestData, loginAs } from './helpers';

let adminCookie: string;
let userCookie: string;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('GET /api/boards/accessible', () => {
  it('admin: 접근 가능한 게시판 목록 반환', async () => {
    const res = await request(app).get('/api/boards/accessible').set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // 개인 폴더 포함 확인
    const hasPersonal = res.body.data.some((b: { isPersonal: boolean }) => b.isPersonal);
    expect(hasPersonal).toBe(true);
  });

  it('일반 사용자: 접근 가능한 게시판 목록 반환', async () => {
    const res = await request(app).get('/api/boards/accessible').set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('미인증 사용자: 401 반환', async () => {
    const res = await request(app).get('/api/boards/accessible');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/boards/check/:boardType', () => {
  it('admin: 존재하는 게시판 접근 권한 확인', async () => {
    const res = await request(app).get('/api/boards/check/notice').set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.hasAccess).toBe(true);
    expect(res.body.data.permissions.canRead).toBe(true);
    expect(res.body.data.permissions.canWrite).toBe(true);
  });

  it('일반 사용자: 읽기 가능한 게시판 확인', async () => {
    const res = await request(app).get('/api/boards/check/notice').set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.hasAccess).toBe(true);
    expect(res.body.data.permissions.canRead).toBe(true);
  });

  it('존재하지 않는 게시판: 403 반환', async () => {
    const res = await request(app)
      .get('/api/boards/check/nonexistent_board_xyz')
      .set('Cookie', userCookie);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/boards', () => {
  it('admin: 전체 게시판 목록 조회', async () => {
    const res = await request(app).get('/api/admin/boards').set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('일반 사용자: admin 게시판 목록 접근 시 403', async () => {
    const res = await request(app).get('/api/admin/boards').set('Cookie', userCookie);

    expect(res.status).toBe(403);
  });
});
