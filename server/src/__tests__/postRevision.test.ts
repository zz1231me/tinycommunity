import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { PostRevision } from '../models/PostRevision';

// 게시글 수정 이력 — 언제 남고, 언제 안 남고, 누가 볼 수 있는지.

let adminCookie: string;
let userCookie: string;

async function createPost(cookie: string, title: string, content: string): Promise<string> {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function updatePost(cookie: string, id: string, title: string, content: string) {
  return request(app)
    .put(`/api/posts/notice/${id}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content });
}

function getRevisions(cookie: string, id: string) {
  return request(app).get(`/api/posts/notice/${id}/revisions`).set('Cookie', cookie);
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('게시글 수정 이력', () => {
  it('새로 작성한 글은 이력이 비어 있다', async () => {
    const id = await createPost(adminCookie, '원본 제목', '<p>원본 내용</p>');

    const res = await getRevisions(adminCookie, id);
    expect(res.status).toBe(200);
    expect(res.body.data.revisions).toEqual([]);
  });

  it('수정하면 "변경 전" 스냅샷이 남는다', async () => {
    const id = await createPost(adminCookie, '원본 제목', '<p>원본 내용</p>');
    await updatePost(adminCookie, id, '수정된 제목', '<p>수정된 내용</p>');

    const res = await getRevisions(adminCookie, id);
    expect(res.status).toBe(200);
    expect(res.body.data.revisions).toHaveLength(1);
    // 이력에 담기는 것은 수정 이전 값이다(현재 값은 게시글 본문에 있다)
    expect(res.body.data.revisions[0].title).toBe('원본 제목');
    expect(res.body.data.revisions[0].content).toBe('<p>원본 내용</p>');
  });

  it('여러 번 수정하면 최신순으로 쌓인다', async () => {
    const id = await createPost(adminCookie, 'v1', '<p>1</p>');
    await updatePost(adminCookie, id, 'v2', '<p>2</p>');
    await updatePost(adminCookie, id, 'v3', '<p>3</p>');

    const res = await getRevisions(adminCookie, id);
    const titles = res.body.data.revisions.map((r: { title: string }) => r.title);
    expect(titles).toEqual(['v2', 'v1']);
  });

  it('같은 밀리초에 두 번 수정해도 순서가 지켜진다', async () => {
    // 시각만으로 정렬하면 같은 밀리초에 쌓인 두 줄의 앞뒤가 요청마다 뒤집힌다.
    // 화면은 맨 위를 "가장 최근" 으로 읽으므로, 그 흔들림은 그대로 거짓말이 된다.
    const id = await createPost(adminCookie, 'a1', '<p>1</p>');
    await updatePost(adminCookie, id, 'a2', '<p>2</p>');
    await updatePost(adminCookie, id, 'a3', '<p>3</p>');
    const now = new Date();
    await PostRevision.update({ createdAt: now }, { where: { postId: id }, silent: true });

    const res = await getRevisions(adminCookie, id);
    expect(res.body.data.revisions.map((r: { title: string }) => r.title)).toEqual(['a2', 'a1']);
  });

  it('제목·내용이 그대로면 이력을 남기지 않는다', async () => {
    const id = await createPost(adminCookie, '그대로', '<p>그대로</p>');
    await updatePost(adminCookie, id, '그대로', '<p>그대로</p>');

    const res = await getRevisions(adminCookie, id);
    expect(res.body.data.revisions).toEqual([]);
  });

  it('제목만 바뀌어도 이력을 남긴다', async () => {
    const id = await createPost(adminCookie, '제목A', '<p>같은 내용</p>');
    await updatePost(adminCookie, id, '제목B', '<p>같은 내용</p>');

    const res = await getRevisions(adminCookie, id);
    expect(res.body.data.revisions).toHaveLength(1);
    expect(res.body.data.revisions[0].title).toBe('제목A');
  });

  it('편집자 정보를 함께 반환한다', async () => {
    const id = await createPost(adminCookie, '원본', '<p>원본</p>');
    await updatePost(adminCookie, id, '수정', '<p>수정</p>');

    const res = await getRevisions(adminCookie, id);
    expect(res.body.data.revisions[0].editor).toMatchObject({ id: 'admin' });
  });

  it('미인증 사용자는 이력을 볼 수 없다', async () => {
    const id = await createPost(adminCookie, '원본', '<p>원본</p>');
    await updatePost(adminCookie, id, '수정', '<p>수정</p>');

    const res = await request(app).get(`/api/posts/notice/${id}/revisions`);
    expect(res.status).toBe(401);
  });

  it('존재하지 않는 게시글은 404', async () => {
    const res = await getRevisions(adminCookie, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('접근 권한 없는 게시판 경로로는 조회할 수 없다', async () => {
    const id = await createPost(adminCookie, '원본', '<p>원본</p>');
    await updatePost(adminCookie, id, '수정', '<p>수정</p>');

    // 존재하지 않는/권한 없는 게시판은 checkReadAccess 미들웨어가 먼저 막는다.
    // (핸들러까지 도달했다면 getPostById 의 boardType 교차 검증이 404 를 낸다)
    const res = await request(app)
      .get(`/api/posts/free/${id}/revisions`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(403);
  });

  it('읽기 권한이 있는 다른 사용자도 이력을 볼 수 있다', async () => {
    const id = await createPost(adminCookie, '원본', '<p>원본</p>');
    await updatePost(adminCookie, id, '수정', '<p>수정</p>');

    const res = await getRevisions(userCookie, id);
    expect(res.status).toBe(200);
    expect(res.body.data.revisions).toHaveLength(1);
  });
});
