import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Post } from '../models/Post';

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

// 조회수.
//
// 응답에 실리는 값은 메모리에서 +1 한 것이고, 실제 증가는 DB 가 원자적으로 한다.
// 둘이 어긋나면 "새로고침하면 숫자가 줄어드는" 화면이 된다.
describe('조회수', () => {
  it('처음 연 사람에게 올라간 값을 바로 보여 주고, DB 값과 같다', async () => {
    const created = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `조회수 ${Date.now()}`, content: '<p>본문</p>' });
    const id = created.body.data.id;

    const before = (await Post.findByPk(id))?.viewCount ?? 0;
    const res = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', userCookie);

    expect(res.body.data.viewCount).toBe(before + 1);
    expect((await Post.findByPk(id))?.viewCount).toBe(res.body.data.viewCount);
  });

  it('같은 사람이 곧바로 다시 열면 오르지 않는다 — 새로고침이 조회수가 되지 않게', async () => {
    const created = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `쿨다운 ${Date.now()}`, content: '<p>본문</p>' });
    const id = created.body.data.id;

    const first = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', userCookie);
    const second = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', userCookie);

    expect(second.body.data.viewCount).toBe(first.body.data.viewCount);
  });

  it('조회는 수정 시각을 건드리지 않는다 — 열기만 해도 "수정됨" 이 되면 안 된다', async () => {
    const created = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `수정시각 ${Date.now()}`, content: '<p>본문</p>' });
    const id = created.body.data.id;
    const before = (await Post.findByPk(id))?.updatedAt;

    await request(app).get(`/api/posts/notice/${id}`).set('Cookie', userCookie);

    expect((await Post.findByPk(id))?.updatedAt).toEqual(before);
  });
});

// 보는 사람의 상태(좋아요·스크랩·관리 권한)를 글과 함께 내려준다.
//
// 따로 물으면 /like, /scrap, /board-managers/check 세 요청이 인증과 게시판 권한
// 검사를 각각 다시 해서 왕복이 넷이 된다.
describe('상세 응답의 viewer', () => {
  let postId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `viewer ${Date.now()}`, content: '<p>본문</p>' });
    postId = res.body.data.id;
  });

  it('좋아요·스크랩·관리권한이 함께 온다', async () => {
    const res = await request(app).get(`/api/posts/notice/${postId}`).set('Cookie', adminCookie);
    expect(res.body.data.viewer).toEqual({
      liked: false,
      likeCount: 0,
      scrapped: false,
      canManage: true, // admin
    });
  });

  it('사람마다 다른 값이다 — 남의 좋아요가 내 화면에 켜지지 않게', async () => {
    await request(app)
      .post(`/api/posts/notice/${postId}/like`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);

    const mine = await request(app).get(`/api/posts/notice/${postId}`).set('Cookie', adminCookie);
    const other = await request(app).get(`/api/posts/notice/${postId}`).set('Cookie', userCookie);

    expect(mine.body.data.viewer.liked).toBe(true);
    expect(other.body.data.viewer.liked).toBe(false);
    // 개수는 둘 다 같아야 한다
    expect(other.body.data.viewer.likeCount).toBe(1);
  });

  it('일반 사용자는 관리 권한이 없다', async () => {
    const res = await request(app).get(`/api/posts/notice/${postId}`).set('Cookie', userCookie);
    expect(res.body.data.viewer.canManage).toBe(false);
  });

  it('태그도 글과 함께 온다 — 제목이 먼저 뜨고 태그가 뒤늦게 붙지 않게', async () => {
    const res = await request(app).get(`/api/posts/notice/${postId}`).set('Cookie', adminCookie);
    expect(Array.isArray(res.body.data.tags)).toBe(true);
  });
});
