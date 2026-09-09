import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';

// 임시저장 — 무엇보다 "본인 것만" 이 지켜져야 한다.
// 초안은 아직 남에게 보일 준비가 안 된 글이라, 새면 발행 여부를 스스로 정할 수 없게 된다.

let adminCookie: string;
let userCookie: string;

function createDraft(cookie: string, body: Record<string, unknown>) {
  return request(app).post('/api/drafts').set(CSRF_HEADER).set('Cookie', cookie).send(body);
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('임시저장 기본 동작', () => {
  it('만들면 목록에 최근 순으로 쌓인다', async () => {
    const first = await createDraft(userCookie, {
      boardType: 'notice',
      title: '첫 초안',
      content: '<p>1</p>',
    });
    expect(first.status).toBe(201);
    const second = await createDraft(userCookie, {
      boardType: 'notice',
      title: '둘째 초안',
      content: '<p>2</p>',
    });

    const list = await request(app).get('/api/drafts').set('Cookie', userCookie);
    expect(list.status).toBe(200);
    const ids = list.body.data.map((d: { id: string }) => d.id);
    expect(ids[0]).toBe(second.body.data.id);
    expect(ids).toContain(first.body.data.id);
  });

  it('목록에는 본문 대신 평문 미리보기만 담는다', async () => {
    await createDraft(userCookie, {
      boardType: 'notice',
      title: '미리보기',
      content: '<p><strong>굵게</strong> 그리고 보통</p>',
    });

    const list = await request(app).get('/api/drafts').set('Cookie', userCookie);
    const hit = list.body.data.find((d: { title: string }) => d.title === '미리보기');
    expect(hit.preview).toBe('굵게 그리고 보통');
    expect(hit.content).toBeUndefined();
  });

  it('이어쓰기 조회에는 본문이 들어 있다', async () => {
    const created = await createDraft(userCookie, {
      boardType: 'notice',
      title: '이어쓰기',
      content: '<p>본문 그대로</p>',
    });

    const res = await request(app)
      .get(`/api/drafts/${created.body.data.id}`)
      .set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('<p>본문 그대로</p>');
    expect(res.body.data.boardType).toBe('notice');
  });

  it('갱신하면 내용과 저장 시각이 바뀐다', async () => {
    const created = await createDraft(userCookie, {
      boardType: 'notice',
      title: 'v1',
      content: '<p>1</p>',
    });
    const before = created.body.data.updatedAt;

    const updated = await request(app)
      .put(`/api/drafts/${created.body.data.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ title: 'v2', content: '<p>2</p>' });
    expect(updated.status).toBe(200);
    expect(new Date(updated.body.data.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime()
    );

    const res = await request(app)
      .get(`/api/drafts/${created.body.data.id}`)
      .set('Cookie', userCookie);
    expect(res.body.data.title).toBe('v2');
    expect(res.body.data.content).toBe('<p>2</p>');
  });

  it('삭제하면 목록에서 사라진다', async () => {
    const created = await createDraft(userCookie, {
      boardType: 'notice',
      title: '지울 초안',
      content: '<p>x</p>',
    });

    const del = await request(app)
      .delete(`/api/drafts/${created.body.data.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/drafts').set('Cookie', userCookie);
    expect(list.body.data.map((d: { id: string }) => d.id)).not.toContain(created.body.data.id);
  });

  it('제목 없이도 저장된다 — 쓰는 도중에도 남아야 한다', async () => {
    const res = await createDraft(userCookie, { boardType: 'notice', content: '<p>제목 전</p>' });
    expect(res.status).toBe(201);
  });

  it('게시판을 지정하지 않으면 400', async () => {
    expect((await createDraft(userCookie, { title: 'x' })).status).toBe(400);
  });
});

describe('초안은 본인 것만', () => {
  it('남의 초안은 목록에 섞이지 않는다', async () => {
    const mine = await createDraft(userCookie, { boardType: 'notice', title: '내 초안' });
    const theirs = await createDraft(adminCookie, { boardType: 'notice', title: '남의 초안' });

    const list = await request(app).get('/api/drafts').set('Cookie', userCookie);
    const ids = list.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(mine.body.data.id);
    expect(ids).not.toContain(theirs.body.data.id);
  });

  it('남의 초안은 관리자도 열 수 없다', async () => {
    const mine = await createDraft(userCookie, { boardType: 'notice', title: '비공개 초안' });

    const res = await request(app)
      .get(`/api/drafts/${mine.body.data.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('남의 초안은 고칠 수 없다', async () => {
    const mine = await createDraft(userCookie, { boardType: 'notice', title: '내 것' });

    const res = await request(app)
      .put(`/api/drafts/${mine.body.data.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: '가로챔', content: '' });
    expect(res.status).toBe(404);
  });

  it('남의 초안은 지울 수 없다', async () => {
    const mine = await createDraft(userCookie, { boardType: 'notice', title: '못 지움' });

    const res = await request(app)
      .delete(`/api/drafts/${mine.body.data.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(404);

    const still = await request(app)
      .get(`/api/drafts/${mine.body.data.id}`)
      .set('Cookie', userCookie);
    expect(still.status).toBe(200);
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/drafts')).status).toBe(401);
  });
});

describe('초안이 게시글 목록으로 새지 않는다', () => {
  it('임시저장은 게시판 목록에 나오지 않는다', async () => {
    await createDraft(userCookie, { boardType: 'notice', title: '목록에 없어야 함' });

    const list = await request(app).get('/api/posts/notice').set('Cookie', adminCookie);
    const titles = list.body.data.posts.map((p: { title: string }) => p.title);
    expect(titles).not.toContain('목록에 없어야 함');
  });

  it('임시저장은 검색에도 걸리지 않는다', async () => {
    await createDraft(userCookie, {
      boardType: 'notice',
      title: '검색되면안됨',
      content: '<p>검색되면안됨</p>',
    });

    const res = await request(app)
      .get('/api/posts/search/global?q=검색되면안됨')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    // data.query 에는 검색어가 그대로 되돌아오므로 결과 배열만 본다
    expect(res.body.data.results).toEqual([]);
  });
});
