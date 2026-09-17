import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';

// 게시글 게시판 이동.
// 이동은 "원래 게시판에서 빠지고 대상 게시판에 나타나며, 딸린 것들이 함께 간다" 가 전부다.
// 그리고 쓸 수 없는 게시판으로 글을 밀어 넣을 수 없어야 한다.

let adminCookie: string;
let userCookie: string;
let personalBoardId: string;

async function makeBoard(id: string, name: string, opts: { isActive?: boolean } = {}) {
  await Board.findOrCreate({
    where: { id },
    defaults: {
      id,
      name,
      description: name,
      isPersonal: false,
      isActive: opts.isActive ?? true,
      order: 10,
    },
  });
}

async function grant(boardId: string, roleId: string, canWrite: boolean) {
  await BoardAccess.findOrCreate({
    where: { boardId, roleId },
    defaults: { boardId, roleId, canRead: true, canWrite, canDelete: false },
  });
}

async function createPost(cookie: string, title: string, board = 'notice'): Promise<string> {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function move(cookie: string, board: string, id: string, target: string, title = '이동글') {
  return request(app)
    .put(`/api/posts/${board}/${id}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: '<p>내용</p>', targetBoardType: target });
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다

  await makeBoard('movedest', '이동 대상');
  await grant('movedest', 'admin', true);
  await grant('movedest', 'user', true);

  // 일반 사용자가 읽기만 되는 게시판
  await makeBoard('readonlyboard', '읽기 전용');
  await grant('readonlyboard', 'admin', true);
  await grant('readonlyboard', 'user', false);

  await makeBoard('inactiveboard', '비활성', { isActive: false });
  await grant('inactiveboard', 'admin', true);

  // 개인 폴더는 앱 부트스트랩이 사용자마다 이미 하나씩 만들어 둔다
  // (isPersonal+ownerId 유니크라 새로 만들 수 없다).
  const personal = await Board.findOne({ where: { isPersonal: true, ownerId: 'admin' } });
  if (!personal) throw new Error('개인 폴더가 없어 이동 거절 테스트를 세울 수 없습니다.');
  personalBoardId = personal.id;

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('이동 성공', () => {
  it('대상 게시판 목록에 나타나고 원래 게시판에서 빠진다', async () => {
    const id = await createPost(adminCookie, `이동 ${Date.now()}`);

    const res = await move(adminCookie, 'notice', id, 'movedest');
    expect(res.status).toBe(200);

    const dest = await request(app).get('/api/posts/movedest').set('Cookie', adminCookie);
    expect(dest.body.data.posts.map((p: { id: string }) => p.id)).toContain(id);

    const origin = await request(app).get('/api/posts/notice').set('Cookie', adminCookie);
    expect(origin.body.data.posts.map((p: { id: string }) => p.id)).not.toContain(id);
  });

  it('댓글이 글을 따라 이동한다', async () => {
    const id = await createPost(adminCookie, `댓글이동 ${Date.now()}`);
    const comment = await request(app)
      .post(`/api/comments/notice/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ content: '따라와야 하는 댓글' });
    expect([200, 201]).toContain(comment.status);

    await move(adminCookie, 'notice', id, 'movedest');

    const after = await request(app).get(`/api/posts/movedest/${id}`).set('Cookie', adminCookie);
    expect(after.status).toBe(200);
    const comments = await request(app)
      .get(`/api/comments/movedest/${id}`)
      .set('Cookie', adminCookie);
    const body = JSON.stringify(comments.body);
    expect(body).toContain('따라와야 하는 댓글');
  });

  it('이동 후 원래 경로로는 열리지 않는다', async () => {
    const id = await createPost(adminCookie, `경로 ${Date.now()}`);
    await move(adminCookie, 'notice', id, 'movedest');

    const res = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });
});

describe('이동 거절', () => {
  it('쓰기 권한이 없는 게시판으로는 옮길 수 없다', async () => {
    const id = await createPost(userCookie, `권한없음 ${Date.now()}`);

    const res = await move(userCookie, 'notice', id, 'readonlyboard');
    expect(res.status).toBe(403);

    // 실패했으면 원래 자리에 그대로 있어야 한다
    const origin = await request(app).get('/api/posts/notice').set('Cookie', adminCookie);
    expect(origin.body.data.posts.map((p: { id: string }) => p.id)).toContain(id);
  });

  it('없는 게시판으로는 옮길 수 없다', async () => {
    const id = await createPost(adminCookie, `없는곳 ${Date.now()}`);
    expect((await move(adminCookie, 'notice', id, 'nosuchboard')).status).toBe(404);
  });

  it('비활성 게시판으로는 옮길 수 없다', async () => {
    const id = await createPost(adminCookie, `비활성 ${Date.now()}`);
    expect((await move(adminCookie, 'notice', id, 'inactiveboard')).status).toBe(400);
  });

  it('개인 폴더로는 옮길 수 없다', async () => {
    const id = await createPost(adminCookie, `개인 ${Date.now()}`);
    expect((await move(adminCookie, 'notice', id, personalBoardId)).status).toBe(400);
  });
});
