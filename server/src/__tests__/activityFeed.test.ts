import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';

// 한곳에서 보는 활동 피드.
//
// 새 글·새 댓글·업무 변경이 게시판마다 흩어져 있어 무슨 일이 있었는지 보려면 하나씩
// 들러야 했다. 읽을 수 있는 게시판의 일만 시간순으로 모은다.
//
// 지켜야 하는 선:
//  1. 읽을 수 없는 게시판의 일은 제목도 새 나가지 않는다.
//  2. 비밀글도 마찬가지다 — 글이 아니라 '그 글에 달린 댓글' 로도 새면 안 된다.
//  3. 새것부터 온다. before 로 이어 볼 수 있다.
//  4. 로그인해야 본다.

let adminCookie: string;
let userCookie: string;

const feed = (cookie: string, query = '') =>
  request(app).get(`/api/activity${query}`).set('Cookie', cookie);

async function createPost(cookie: string, title: string, board = 'notice') {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

const comment = (cookie: string, postId: string, content: string, board = 'notice') =>
  request(app)
    .post(`/api/comments/${board}/${postId}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ content });

const titles = (body: { data: { postTitle: string }[] }) => body.data.map(i => i.postTitle);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  // 일반 사용자가 못 읽는 게시판
  await Board.findOrCreate({
    where: { id: 'actsecret' },
    defaults: { id: 'actsecret', name: '비공개', order: 97 },
  });
  await BoardAccess.destroy({ where: { boardId: 'actsecret' } });
  await BoardAccess.create({
    boardId: 'actsecret',
    roleId: 'admin',
    canRead: true,
    canWrite: true,
    canDelete: true,
  });
  // 업무 변경을 남기려면 업무용 게시판이어야 한다
  await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
});

// 테스트 DB 는 스위트끼리 함께 쓴다. 여기서 글·이력을 통째로 지우면 다른 스위트가
// beforeAll 에 만들어 둔 것까지 사라지므로, 지우지 않고 제목으로 가려 본다.
// 대신 줄 수가 모자라 밀리지 않게 넉넉히 받아 온다.
const MANY = '?limit=50';

afterAll(async () => {
  await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
});

describe('무엇이 모이는가', () => {
  it('새 글이 올라온다', async () => {
    await createPost(adminCookie, '공지 하나');

    const res = await feed(userCookie, MANY);
    expect(res.status).toBe(200);
    expect(titles(res.body)).toContain('공지 하나');
    expect(res.body.data[0]).toMatchObject({ kind: 'post', boardName: expect.any(String) });
  });

  it('댓글도 그 글을 가리키며 올라온다', async () => {
    const id = await createPost(adminCookie, '댓글 달릴 글');
    expect((await comment(userCookie, id, '좋습니다')).status).toBe(201);

    const kinds = (await feed(userCookie, MANY)).body.data.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain('comment');
  });

  it('업무 변경도 올라온다 — 무엇이 바뀌었는지와 함께', async () => {
    const id = await createPost(adminCookie, '업무 글');
    await request(app)
      .patch(`/api/posts/notice/${id}/task`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ workStatus: 'doing' })
      .expect(200);

    const task = (await feed(adminCookie, MANY)).body.data.find(
      (i: { kind: string }) => i.kind === 'task'
    );
    expect(task).toMatchObject({ change: 'status', toValue: 'doing', postTitle: '업무 글' });
  });

  it('새것부터 온다', async () => {
    await createPost(adminCookie, '먼저 쓴 글');
    await createPost(adminCookie, '나중 쓴 글');

    const list = titles((await feed(adminCookie, MANY)).body);
    expect(list.indexOf('나중 쓴 글')).toBeLessThan(list.indexOf('먼저 쓴 글'));
  });
});

describe('못 읽는 것은 새지 않는다', () => {
  it('읽을 수 없는 게시판의 글은 오지 않는다', async () => {
    await createPost(adminCookie, '비공개 공지', 'actsecret');

    expect(titles((await feed(userCookie, MANY)).body)).not.toContain('비공개 공지');
    expect(titles((await feed(adminCookie, MANY)).body)).toContain('비공개 공지');
  });

  it('읽을 수 없는 게시판 글의 댓글도 오지 않는다 — 제목이 댓글로 새면 같은 일이다', async () => {
    const id = await createPost(adminCookie, '비공개 글', 'actsecret');
    expect((await comment(adminCookie, id, '안쪽 이야기', 'actsecret')).status).toBe(201);

    expect(titles((await feed(userCookie, MANY)).body)).not.toContain('비공개 글');
  });

  it('남의 비밀글은 오지 않는다', async () => {
    await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '관리자 비밀글',
        content: '<p>x</p>',
        isSecret: true,
        secretType: 'users',
        secretUserIds: ['admin'],
      })
      .expect(201);

    expect(titles((await feed(userCookie, MANY)).body)).not.toContain('관리자 비밀글');
    expect(titles((await feed(adminCookie, MANY)).body)).toContain('관리자 비밀글');
  });
});

describe('이어 보기', () => {
  it('before 보다 이전 것만 온다', async () => {
    await createPost(adminCookie, '예전 글');
    const cut = new Date();
    await new Promise(r => setTimeout(r, 1100));
    await createPost(adminCookie, '최근 글');

    const older = titles((await feed(adminCookie, `?before=${cut.toISOString()}&limit=50`)).body);
    expect(older).toContain('예전 글');
    expect(older).not.toContain('최근 글');
  });

  it('limit 으로 줄 수를 줄인다', async () => {
    await createPost(adminCookie, '글 하나');
    await createPost(adminCookie, '글 둘');

    expect((await feed(adminCookie, '?limit=1')).body.data).toHaveLength(1);
  });
});

describe('로그인', () => {
  it('로그인하지 않으면 401', async () => {
    await request(app).get('/api/activity').expect(401);
  });
});
