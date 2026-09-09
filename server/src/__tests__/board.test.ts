import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';

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

// 게시판 용도(업무용/일반).
//
// 모든 게시판이 업무 목록은 아니다. 공지·자유게시판에까지 담당자·상태 줄이 붙으면
// 쓰지 않는 기능이 화면만 차지한다. 그래서 게시판을 만들 때 정하고, 나중에 바꿀 수 있다.
describe('게시판 용도', () => {
  it('새 게시판은 기본이 일반이다 — 켜는 것은 선택이어야 한다', async () => {
    const id = `plain${Date.now()}`.slice(0, 20);
    const res = await request(app)
      .post('/api/admin/boards')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ id, name: '기본용도' });

    expect(res.status).toBe(201);
    expect((await Board.findByPk(id))?.taskEnabled).toBe(false);
  });

  it('만들 때 업무용으로 지정할 수 있다', async () => {
    const id = `task${Date.now()}`.slice(0, 20);
    await request(app)
      .post('/api/admin/boards')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ id, name: '업무용', taskEnabled: true });

    expect((await Board.findByPk(id))?.taskEnabled).toBe(true);
  });

  it('만든 뒤에도 바꿀 수 있다', async () => {
    const id = `flip${Date.now()}`.slice(0, 20);
    await request(app)
      .post('/api/admin/boards')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ id, name: '전환' });

    const res = await request(app)
      .put(`/api/admin/boards/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ taskEnabled: true });

    expect(res.status).toBe(200);
    expect((await Board.findByPk(id))?.taskEnabled).toBe(true);
  });

  it('true/false 가 아니면 400 — 문자열 "true" 가 그대로 저장되지 않게', async () => {
    const res = await request(app)
      .post('/api/admin/boards')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ id: `bad${Date.now()}`.slice(0, 20), name: '잘못된값', taskEnabled: 'yes' });

    expect(res.status).toBe(400);
  });

  it('목록과 권한 확인 응답에 용도가 함께 온다 — 화면이 따로 물어보지 않게', async () => {
    await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
    try {
      const accessible = await request(app)
        .get('/api/boards/accessible')
        .set('Cookie', adminCookie);
      const notice = accessible.body.data.find((b: { id: string }) => b.id === 'notice');
      expect(notice.taskEnabled).toBe(true);

      const check = await request(app).get('/api/boards/check/notice').set('Cookie', adminCookie);
      expect(check.body.data.board.taskEnabled).toBe(true);
    } finally {
      await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
    }
  });

  it('개인공간은 업무용이 아니다', async () => {
    const accessible = await request(app).get('/api/boards/accessible').set('Cookie', userCookie);
    const personal = accessible.body.data.find((b: { isPersonal: boolean }) => b.isPersonal);
    expect(personal.taskEnabled).toBe(false);
  });
});
