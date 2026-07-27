import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';

let adminCookie: string;
let userCookie: string;
let createdPostId: number;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('POST /api/posts/:boardType', () => {
  it('admin: 게시글 작성 성공', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '테스트 공지사항',
        content: '<p>테스트 내용입니다.</p>',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.title).toBe('테스트 공지사항');
    createdPostId = res.body.data.id;
  });

  it('일반 사용자: 쓰기 권한 있는 게시판에 글 작성', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({
        title: '사용자 테스트 글',
        content: '<p>사용자 작성 내용</p>',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('미인증 사용자: 게시글 작성 시 401', async () => {
    const res = await request(app).post('/api/posts/notice').set(CSRF_HEADER).send({
      title: '무단 작성',
      content: '내용',
    });

    expect(res.status).toBe(401);
  });

  it('제목 누락 시 유효성 검사 실패', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        content: '내용만 있음',
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/posts/:boardType', () => {
  it('게시판 게시글 목록 조회', async () => {
    const res = await request(app).get('/api/posts/notice').set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.posts)).toBe(true);
  });

  it('미인증 사용자: 게시글 목록 조회 시 401', async () => {
    const res = await request(app).get('/api/posts/notice');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/posts/:boardType/:id', () => {
  it('게시글 상세 조회', async () => {
    const res = await request(app)
      .get(`/api/posts/notice/${createdPostId}`)
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id', createdPostId);
  });

  it('존재하지 않는 게시글 조회: 404', async () => {
    const res = await request(app).get('/api/posts/notice/999999').set('Cookie', userCookie);

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/posts/:boardType/:id', () => {
  it('작성자: 게시글 수정 성공', async () => {
    const res = await request(app)
      .put(`/api/posts/notice/${createdPostId}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: '수정된 제목', content: '<p>수정된 내용</p>' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('수정된 제목');
  });

  it('다른 사용자: 게시글 수정 시 403', async () => {
    const res = await request(app)
      .put(`/api/posts/notice/${createdPostId}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ title: '무단 수정', content: '내용' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/posts/:boardType/:id', () => {
  it('admin: 게시글 삭제 성공', async () => {
    const res = await request(app)
      .delete(`/api/posts/notice/${createdPostId}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('삭제된 게시글 재조회: 404', async () => {
    const res = await request(app)
      .get(`/api/posts/notice/${createdPostId}`)
      .set('Cookie', userCookie);

    expect(res.status).toBe(404);
  });
});
