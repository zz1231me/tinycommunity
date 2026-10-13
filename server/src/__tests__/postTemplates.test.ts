import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { PostTemplate } from '../models/PostTemplate';

// 글 템플릿. 회의록·보고서처럼 틀이 정해진 글을 빈 에디터에서 매번 다시 만들지 않게 한다.
//
// 지켜야 하는 선:
//  1. 만드는 것은 관리자만.
//  2. 본문은 관리자가 넣어도 글과 똑같이 씻는다 — 템플릿이 스크립트 심는 구멍이 되지 않게.
//  3. 특정 게시판 전용 템플릿은 그 게시판을 읽을 수 있는 사람에게만 보인다(이름만으로도 사정이 보인다).
//  4. 꺼 둔 템플릿은 쓰는 사람 목록에 오지 않는다.

let adminCookie: string;
let userCookie: string;

const create = (cookie: string, body: unknown) =>
  request(app)
    .post('/api/admin/post-templates')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body as object);

const list = (cookie: string, boardType?: string) =>
  request(app)
    .get(`/api/post-templates${boardType ? `?boardType=${boardType}` : ''}`)
    .set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  await Board.findOrCreate({
    where: { id: 'tplsecret' },
    defaults: { id: 'tplsecret', name: '비공개', order: 98 },
  });
  await BoardAccess.destroy({ where: { boardId: 'tplsecret' } });
  await BoardAccess.create({
    boardId: 'tplsecret',
    roleId: 'admin',
    canRead: true,
    canWrite: true,
    canDelete: true,
  });
});

beforeEach(async () => {
  await PostTemplate.destroy({ where: {} });
});

describe('만들기 권한', () => {
  it('관리자는 만들 수 있다', async () => {
    const res = await create(adminCookie, { name: '회의록', content: '<h2>안건</h2>' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: '회의록', isActive: true });
  });

  it('일반 사용자는 만들 수 없다', async () => {
    await create(userCookie, { name: '몰래', content: '<p>x</p>' }).expect(403);
  });

  it('이름이나 본문이 비면 거절한다', async () => {
    await create(adminCookie, { name: '', content: '<p>x</p>' }).expect(400);
    await create(adminCookie, { name: '틀', content: '   ' }).expect(400);
  });

  it('없는 게시판을 지정하면 거절한다', async () => {
    await create(adminCookie, {
      name: '틀',
      content: '<p>x</p>',
      boardType: 'nosuchboard',
    }).expect(400);
  });
});

describe('본문 씻기', () => {
  it('스크립트는 저장되지 않는다 — 글 본문과 같은 규칙', async () => {
    const res = await create(adminCookie, {
      name: '위험한 틀',
      content: '<p>안녕</p><script>alert(1)</script><img src=x onerror="alert(2)">',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.content).not.toMatch(/<script/i);
    expect(res.body.data.content).not.toMatch(/onerror/i);
    expect(res.body.data.content).toContain('안녕');
  });
});

describe('고를 수 있는 목록', () => {
  it('공통 템플릿은 누구에게나 보인다', async () => {
    await create(adminCookie, { name: '공통 회의록', content: '<p>틀</p>' }).expect(201);

    const res = await list(userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { name: string }) => t.name)).toEqual(['공통 회의록']);
  });

  it('꺼 둔 템플릿은 오지 않는다', async () => {
    await create(adminCookie, {
      name: '쉬는 틀',
      content: '<p>틀</p>',
      isActive: false,
    }).expect(201);

    expect((await list(userCookie)).body.data).toHaveLength(0);
  });

  it('게시판 전용 템플릿은 그 게시판을 읽을 수 있는 사람에게만 보인다', async () => {
    await create(adminCookie, {
      name: '비공개 전용 틀',
      content: '<p>틀</p>',
      boardType: 'tplsecret',
    }).expect(201);

    expect((await list(adminCookie)).body.data).toHaveLength(1);
    expect((await list(userCookie)).body.data).toHaveLength(0);
    // 그 게시판을 주소로 콕 집어 물어도 마찬가지다
    expect((await list(userCookie, 'tplsecret')).body.data).toHaveLength(0);
  });

  it('게시판을 주면 그 게시판 것과 공통 것만 온다', async () => {
    await create(adminCookie, { name: '공통', content: '<p>a</p>' }).expect(201);
    await create(adminCookie, { name: '공지 전용', content: '<p>b</p>', boardType: 'notice' });
    await create(adminCookie, { name: '자유 전용', content: '<p>c</p>', boardType: 'free' });

    const names = (await list(adminCookie, 'notice')).body.data.map(
      (t: { name: string }) => t.name
    );
    expect(names.sort()).toEqual(['공지 전용', '공통'].sort());
  });

  it('순서대로 온다', async () => {
    await create(adminCookie, { name: '나중', content: '<p>b</p>', order: 2 }).expect(201);
    await create(adminCookie, { name: '먼저', content: '<p>a</p>', order: 1 }).expect(201);

    expect((await list(adminCookie)).body.data.map((t: { name: string }) => t.name)).toEqual([
      '먼저',
      '나중',
    ]);
  });

  it('로그인하지 않으면 401', async () => {
    await request(app).get('/api/post-templates').expect(401);
  });
});

describe('고치고 지우기', () => {
  it('고치면 저장되고, 본문도 다시 씻는다', async () => {
    const made = await create(adminCookie, { name: '틀', content: '<p>처음</p>' });
    const id = made.body.data.id as number;

    const res = await request(app)
      .put(`/api/admin/post-templates/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: '고친 틀', content: '<p>나중</p><script>alert(1)</script>' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('고친 틀');
    expect(res.body.data.content).not.toMatch(/<script/i);
  });

  it('지우면 목록에서 사라진다', async () => {
    const made = await create(adminCookie, { name: '지울 틀', content: '<p>x</p>' });
    const id = made.body.data.id as number;

    await request(app)
      .delete(`/api/admin/post-templates/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .expect(200);

    expect((await list(adminCookie)).body.data).toHaveLength(0);
  });

  it('없는 템플릿은 404', async () => {
    await request(app)
      .put('/api/admin/post-templates/999999')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: '틀', content: '<p>x</p>' })
      .expect(404);
  });
});
