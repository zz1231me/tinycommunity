// 글 주소의 게시판 칸을 바꿔치기하는 것 — 전 경로 한 번에.
//
// /api/posts/:boardType/:id/... 는 22갈래인데, 앞에 선 미들웨어(checkReadAccess 등)는
// URL 의 boardType 만 본다. 내가 들어갈 수 있는 게시판 이름을 적으면 미들웨어는 통과하므로,
// '그 글이 정말 그 게시판 것인지' 는 각 핸들러가 스스로 봐야 한다. 한 갈래만 빠져도
// 들어갈 수 없는 게시판의 글이 읽히거나 고쳐진다.
//
// 댓글 쪽에서 같은 확인이 네 곳에 흩어져 있는 것을 봤고, 하위 업무에서는 실제로 빠져 있었다.
// 그래서 갈래마다 따로 묻지 않고 한 줄로 늘어놓고 전부 두드려 본다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Board } from '../models/Board';
import { BoardAccess } from '../models/BoardAccess';

/** 관리자만 들어갈 수 있는 게시판. 글은 여기에 있다. */
const CLOSED = 'closedboard';
/** 공격자가 들어갈 수 있는 게시판. 주소에 이 이름을 적는다. */
const OPEN = 'notice';

let adminCookie: string;
let userCookie: string;
let postId: string;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  await Board.findOrCreate({
    where: { id: CLOSED },
    defaults: {
      id: CLOSED,
      name: '닫힌 게시판',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      order: 98,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: CLOSED, roleId: 'admin' },
    defaults: { boardId: CLOSED, roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
  });
  // user 역할에는 일부러 권한을 주지 않는다.

  const created = await request(app)
    .post(`/api/posts/${CLOSED}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title: `교차 ${Date.now()}`, content: '<p>닫힌 게시판의 글</p>' });
  expect(created.status).toBe(201);
  postId = created.body.data.id;
});

type Call = [method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, body?: object];

/** 글 하나에 달린 모든 갈래. 지우는 것은 맨 뒤에 둔다. */
const CALLS: Call[] = [
  ['get', ''],
  ['get', '/revisions'],
  ['get', '/attachment-versions'],
  ['post', '/verify', { password: 'x' }],
  ['get', '/like'],
  ['post', '/like'],
  ['post', '/read'],
  ['patch', '/pin', { isPinned: true }],
  ['get', '/scrap'],
  ['post', '/scrap'],
  ['patch', '/task', { workStatus: 'doing' }],
  ['get', '/backlinks'],
  ['get', '/activity'],
  ['get', '/subtasks'],
  ['post', '/subtasks', { title: '끼워 넣기' }],
  ['get', '/readers'],
  ['get', '/tags'],
  ['post', '/tags', { tagIds: [] }],
  ['delete', '/subtasks/999999'],
  ['put', '', { title: '덮어쓰기', content: '<p>남의 글</p>' }],
  ['delete', ''],
];

describe('들어갈 수 없는 게시판의 글을, 들어갈 수 있는 게시판 이름으로 부르기', () => {
  it.each(CALLS.map(c => [`${c[0].toUpperCase()} ${c[1] || '/'}`, c] as const))(
    '%s — 2xx 가 나오면 안 된다',
    async (_label, [method, path, body]) => {
      const req = request(app)
        [method](`/api/posts/${OPEN}/${postId}${path}`)
        .set(CSRF_HEADER)
        .set('Cookie', userCookie);
      const res = await (body ? req.send(body) : req);

      // 403(기능 꺼짐·권한)도 404(없는 글)도 괜찮다. 통과만 아니면 된다.
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  );

  // 관련 글만 예외다. 접근할 수 없는 글이면 빈 목록을 200 으로 돌려준다 —
  // 없는 글에도 똑같이 빈 목록이라 '있다/없다' 가 새지 않는다. 그래서 상태가 아니라
  // 몸통이 비어 있는지를 본다.
  it('GET /related — 빈 목록이고 닫힌 게시판의 글은 끼어들지 않는다', async () => {
    const res = await request(app)
      .get(`/api/posts/${OPEN}/${postId}/related`)
      .set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('제 게시판 이름으로는 주인이 읽을 수 있다 — 양성 대조', async () => {
    // 이것이 없으면 '글이 애초에 안 만들어졌다' 는 경우에도 위가 전부 통과한다
    const res = await request(app).get(`/api/posts/${CLOSED}/${postId}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toContain('교차');
  });
});
