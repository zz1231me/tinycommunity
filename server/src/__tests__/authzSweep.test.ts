// server/src/__tests__/authzSweep.test.ts
// 관리자 API 가 정말 전부 막혀 있는지 훑는다.
//
// 라우트를 손으로 나열하면 새로 추가된 엔드포인트가 검사에서 빠진다.
// 그래서 앱에 실제로 등록된 라우트를 걸어 다니며 /api/admin 아래 GET 을 모두 찾아
// (1) 로그인하지 않은 요청 (2) 일반 사용자 요청 을 넣어 본다. 200 이 하나라도
// 나오면 그 엔드포인트는 뚫린 것이다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { readFileSync } from 'fs';
import { join } from 'path';

const PASSWORD = 'TestUser123!';
let userCookie: string;
let adminCookie: string;

/**
 * 관리자 라우트 목록을 라우트 파일에서 직접 읽는다.
 *
 * 앱 내부(Express 의 라우터 스택)를 들여다보는 방법은 버전에 따라 모양이 달라
 * 조용히 0건을 돌려줄 수 있다 — 그러면 "유출 없음" 검사가 빈 목록 위에서 통과한다.
 * 파일을 읽으면 새로 추가된 라우트도 자동으로 검사에 들어온다.
 */
function adminGetPaths(): string[] {
  const file = readFileSync(join(__dirname, '../routes/admin.routes.ts'), 'utf-8');
  const paths: string[] = [];
  const re = /router\.get\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(file)) !== null) paths.push('/api/admin' + m[1]);
  return paths;
}

/** 가드가 첫 라우트보다 앞에 걸려 있는지 — 뒤로 밀리면 그 위 라우트는 무방비다 */
function guardIsFirst(): boolean {
  const file = readFileSync(join(__dirname, '../routes/admin.routes.ts'), 'utf-8');
  const guard = file.search(/router\.use\(\s*\n?\s*authenticate/);
  const firstRoute = file.search(/router\.(get|post|put|patch|delete)\(/);
  return guard !== -1 && firstRoute !== -1 && guard < firstRoute;
}

/** :id 같은 자리를 그럴듯한 값으로 채운다 (404 여도 401/403 판정에는 영향 없음) */
const fill = (p: string) => p.replace(/:[A-Za-z0-9_]+/g, 'probe');

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  if (!(await User.findByPk('authzuser'))) {
    await User.create({
      id: 'authzuser',
      password: PASSWORD,
      name: '권한테스트',
      email: 'authz@test.com',
      roleId: 'user',
      isActive: true,
    });
  }
  const res = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ id: 'authzuser', password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  userCookie = list.map(c => c.split(';')[0]).join('; ');
});

describe('관리자 API 인가', () => {
  it('검사 대상 라우트를 실제로 찾아낸다', () => {
    // 수집이 깨지면 아래 검사들이 빈 목록 위에서 조용히 통과한다 — 먼저 막는다
    expect(adminGetPaths().length).toBeGreaterThan(10);
  });

  it('인증·관리자 가드가 첫 라우트보다 앞에 걸려 있다', () => {
    expect(guardIsFirst()).toBe(true);
  });

  it('로그인하지 않으면 관리자 API 에 하나도 닿지 못한다', async () => {
    const paths = adminGetPaths();
    const leaked: string[] = [];
    for (const p of paths) {
      const res = await request(app).get(fill(p));
      if (res.status === 200) leaked.push(`${p} → ${res.status}`);
    }
    expect(leaked).toEqual([]);
  });

  it('일반 사용자는 관리자 API 에 하나도 닿지 못한다', async () => {
    const paths = adminGetPaths();
    const leaked: string[] = [];
    for (const p of paths) {
      const res = await request(app).get(fill(p)).set('Cookie', userCookie);
      if (res.status === 200) leaked.push(`${p} → ${res.status}`);
    }
    expect(leaked).toEqual([]);
  });

  it('관리자는 실제로 들어갈 수 있다 — 위 검사가 전부 404 라서 통과한 것이 아님을 보인다', async () => {
    const res = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });
});

describe('권한 없는 게시판', () => {
  const BOARD = 'authz-closed-board';

  beforeAll(async () => {
    await BoardAccess.destroy({ where: { boardId: BOARD } });
    await Board.destroy({ where: { id: BOARD }, force: true });
    await Board.create({
      id: BOARD,
      name: '잠긴 게시판',
      description: null,
      isActive: true,
      order: 900,
      ownerId: null,
    });
    // admin 역할에만 읽기를 준다 — 일반 사용자는 어떤 권한도 없다
    await BoardAccess.create({
      boardId: BOARD,
      roleId: 'admin',
      canRead: true,
      canWrite: true,
      canDelete: true,
    });
  });

  it('일반 사용자는 글 목록을 볼 수 없다', async () => {
    const res = await request(app).get(`/api/posts/${BOARD}`).set('Cookie', userCookie);
    expect(res.status).not.toBe(200);
    expect([401, 403, 404]).toContain(res.status);
  });

  it('로그인하지 않으면 글 목록을 볼 수 없다', async () => {
    const res = await request(app).get(`/api/posts/${BOARD}`);
    expect(res.status).not.toBe(200);
  });

  it('일반 사용자는 그 게시판에 글을 쓸 수 없다', async () => {
    const res = await request(app)
      .post(`/api/posts/${BOARD}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ title: '몰래', content: '몰래' });
    expect(res.status).not.toBe(201);
    expect(res.status).not.toBe(200);
  });

  it('관리자는 같은 게시판을 볼 수 있다 — 위 검사가 게시판 부재 때문이 아님을 보인다', async () => {
    const res = await request(app).get(`/api/posts/${BOARD}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });
});
