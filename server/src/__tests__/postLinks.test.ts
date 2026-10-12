import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { PostLink } from '../models/PostLink';
import { extractPostLinks } from '../services/postLink.service';

// 글에서 글로 가는 링크(역링크).
//
// 본문에 다른 글의 주소를 넣으면 그 글 화면에 '이 글을 가리키는 글' 로 모인다.
// 지켜야 하는 선:
//  1. 본문에서 링크를 지우면 줄도 사라진다 — 저장할 때마다 다시 쓴다.
//  2. 보는 사람이 읽을 수 없는 게시판의 글은 제목도 새 나가지 않는다.
//  3. 없는 글을 가리키는 주소는 줄을 만들지 않는다.

let adminCookie: string;
let userCookie: string;

const link = (boardType: string, postId: string) =>
  `<p>앞의 결정은 <a href="/dashboard/posts/${boardType}/${postId}">저 글</a>에 있습니다.</p>`;

async function createPost(cookie: string, title: string, content: string, board = 'notice') {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

const backlinks = (cookie: string, board: string, id: string) =>
  request(app).get(`/api/posts/${board}/${id}/backlinks`).set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  // 일반 사용자가 못 읽는 게시판. 거기 글이 가리켜도 제목이 보이면 안 된다.
  await Board.findOrCreate({
    where: { id: 'secretboard' },
    defaults: { id: 'secretboard', name: '비공개', order: 99 },
  });
  await BoardAccess.destroy({ where: { boardId: 'secretboard' } });
  await BoardAccess.create({
    boardId: 'secretboard',
    roleId: 'admin',
    canRead: true,
    canWrite: true,
    canDelete: true,
  });
});

describe('본문에서 글 주소 뽑기', () => {
  it('상대 주소와 전체 주소 모두 집는다', () => {
    const content = `
      <a href="/dashboard/posts/notice/ABCD1234EFGH">하나</a>
      <a href="https://example.com/dashboard/posts/free/ZZZZ9999YYYY">둘</a>`;
    expect(extractPostLinks(content).sort()).toEqual(['ABCD1234EFGH', 'ZZZZ9999YYYY'].sort());
  });

  it('같은 글을 여러 번 가리켜도 하나로 센다', () => {
    const id = 'ABCD1234EFGH';
    expect(extractPostLinks(`${link('notice', id)}${link('free', id)}`)).toEqual([id]);
  });

  it('글 주소가 아닌 링크는 집지 않는다', () => {
    const content = '<a href="/dashboard/calendar">달력</a><a href="https://x.test">밖</a>';
    expect(extractPostLinks(content)).toEqual([]);
  });
});

describe('역링크', () => {
  it('가리킨 글 화면에 가리킨 쪽이 모인다', async () => {
    const target = await createPost(adminCookie, `대상 ${Date.now()}`, '<p>원본</p>');
    const source = await createPost(
      adminCookie,
      `가리키는 글 ${Date.now()}`,
      link('notice', target)
    );

    const res = await backlinks(adminCookie, 'notice', target);
    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { id: string }) => b.id)).toEqual([source]);
    expect(res.body.data[0]).toMatchObject({ boardType: 'notice', boardName: expect.any(String) });
  });

  it('본문에서 링크를 지우면 역링크도 사라진다', async () => {
    const target = await createPost(adminCookie, `대상2 ${Date.now()}`, '<p>원본</p>');
    const source = await createPost(adminCookie, `지울 글 ${Date.now()}`, link('notice', target));
    expect((await backlinks(adminCookie, 'notice', target)).body.data).toHaveLength(1);

    await request(app)
      .put(`/api/posts/notice/${source}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: '링크 없앰', content: '<p>이제 아무것도 가리키지 않는다</p>' })
      .expect(200);

    expect((await backlinks(adminCookie, 'notice', target)).body.data).toHaveLength(0);
  });

  it('자기 자신을 가리키는 주소는 줄을 만들지 않는다', async () => {
    const own = await createPost(adminCookie, `자기참조 ${Date.now()}`, '<p>x</p>');
    await request(app)
      .put(`/api/posts/notice/${own}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: '자기참조', content: link('notice', own) })
      .expect(200);

    expect(await PostLink.count({ where: { fromPostId: own } })).toBe(0);
  });

  it('없는 글을 가리키는 주소는 버린다', async () => {
    const id = await createPost(adminCookie, `유령 ${Date.now()}`, link('notice', 'NOSUCHPOST99'));
    expect(await PostLink.count({ where: { fromPostId: id } })).toBe(0);
  });

  it('읽을 수 없는 게시판에서 온 링크는 보이지 않는다 — 제목이 새 나가지 않게', async () => {
    const target = await createPost(adminCookie, `대상3 ${Date.now()}`, '<p>원본</p>');
    const hidden = await createPost(
      adminCookie,
      `비공개에서 가리킴 ${Date.now()}`,
      link('notice', target),
      'secretboard'
    );

    // 관리자는 보인다
    expect(
      (await backlinks(adminCookie, 'notice', target)).body.data.map((b: { id: string }) => b.id)
    ).toContain(hidden);
    // 일반 사용자에게는 안 보인다
    expect((await backlinks(userCookie, 'notice', target)).body.data).toHaveLength(0);
  });

  it('비밀글에서 온 링크는 명단에 없는 사람에게 보이지 않는다', async () => {
    const target = await createPost(adminCookie, `대상4 ${Date.now()}`, '<p>원본</p>');
    const secret = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: `비밀글 ${Date.now()}`,
        content: link('notice', target),
        isSecret: true,
        secretType: 'users',
        secretUserIds: ['admin'],
      });
    expect(secret.status).toBe(201);

    expect((await backlinks(userCookie, 'notice', target)).body.data).toHaveLength(0);
    expect(
      (await backlinks(adminCookie, 'notice', target)).body.data.map((b: { id: string }) => b.id)
    ).toContain(secret.body.data.id);
  });

  it('로그인하지 않으면 401', async () => {
    const target = await createPost(adminCookie, `대상5 ${Date.now()}`, '<p>원본</p>');
    await request(app).get(`/api/posts/notice/${target}/backlinks`).expect(401);
  });
});
