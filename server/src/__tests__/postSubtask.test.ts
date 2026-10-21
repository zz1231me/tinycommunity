import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { Post } from '../models/Post';

// 하위 업무(지라의 subtask 자리).
//
// 글 하나가 그대로 하위 업무가 된다 — 담당자·마감·상태를 상위와 따로 가진다.
//
// 지켜야 하는 선:
//  1. 한 단계만. 하위의 하위를 허용하면 고리가 생기고 화면도 끝없이 펼쳐진다.
//  2. 상위를 바꿀 수 있는 사람만 하위를 붙인다 — 남의 업무에 일거리를 끼워 넣지 못하게.
//  3. 떼어 내도 글은 남는다(혼자 선 업무가 된다). 지우는 것과 다르다.
//  4. 끝난 하위도 목록에 온다 — '3/5 끝남' 을 세려면 끝난 것도 세야 한다.
//  5. 업무용 게시판에서만.

let adminCookie: string;
let userCookie: string;

const create = async (cookie: string, title: string, board = 'notice') => {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};

const add = (cookie: string, parentId: string, body: unknown, board = 'notice') =>
  request(app)
    .post(`/api/posts/${board}/${parentId}/subtasks`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body as object);

const list = (cookie: string, parentId: string, board = 'notice') =>
  request(app).get(`/api/posts/${board}/${parentId}/subtasks`).set('Cookie', cookie);

const detach = (cookie: string, parentId: string, childId: string, board = 'notice') =>
  request(app)
    .delete(`/api/posts/${board}/${parentId}/subtasks/${childId}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie);

const setTask = (cookie: string, id: string, body: unknown, board = 'notice') =>
  request(app)
    .patch(`/api/posts/${board}/${id}/task`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body as object);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
  await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });

  // 일반 사용자가 못 읽는 업무용 게시판 — 주소 바꿔치기 확인용
  await Board.findOrCreate({
    where: { id: 'subsecret' },
    defaults: { id: 'subsecret', name: '비공개 업무', order: 96, taskEnabled: true },
  });
  await Board.update({ taskEnabled: true }, { where: { id: 'subsecret' } });
  await BoardAccess.destroy({ where: { boardId: 'subsecret' } });
  await BoardAccess.create({
    boardId: 'subsecret',
    roleId: 'admin',
    canRead: true,
    canWrite: true,
    canDelete: true,
  });

  // 읽기만 되는 업무용 게시판 — 담당자라도 글을 만들지 못해야 한다
  await Board.findOrCreate({
    where: { id: 'subreadonly' },
    defaults: { id: 'subreadonly', name: '읽기 전용 업무', order: 95, taskEnabled: true },
  });
  await Board.update({ taskEnabled: true }, { where: { id: 'subreadonly' } });
  await BoardAccess.destroy({ where: { boardId: 'subreadonly' } });
  await BoardAccess.bulkCreate([
    { boardId: 'subreadonly', roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
    { boardId: 'subreadonly', roleId: 'user', canRead: true, canWrite: false, canDelete: false },
  ]);
});

afterAll(async () => {
  await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
});

describe('붙이기', () => {
  it('하위 업무를 만들면 상위에 딸려 나온다 — 상태는 할 일로 시작한다', async () => {
    const parent = await create(adminCookie, `상위 ${Date.now()}`);

    const made = await add(adminCookie, parent, { title: 'A 라인 점검' });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ title: 'A 라인 점검', workStatus: 'todo' });

    const rows = (await list(adminCookie, parent)).body.data;
    expect(rows.map((t: { title: string }) => t.title)).toEqual(['A 라인 점검']);
  });

  it('담당자를 함께 주면 그대로 지정된다', async () => {
    const parent = await create(adminCookie, `담당 ${Date.now()}`);

    const made = await add(adminCookie, parent, { title: '맡겨 둔 일', assigneeId: 'testuser' });

    expect(made.status).toBe(201);
    expect(made.body.data.assignee).toMatchObject({ id: 'testuser' });
  });

  it('제목이 비면 거절한다', async () => {
    const parent = await create(adminCookie, `빈제목 ${Date.now()}`);
    await add(adminCookie, parent, { title: '   ' }).expect(400);
    await add(adminCookie, parent, {}).expect(400);
  });

  it('하위의 하위는 만들지 않는다 — 한 단계만', async () => {
    const parent = await create(adminCookie, `두단계 ${Date.now()}`);
    const child = (await add(adminCookie, parent, { title: '첫 단계' })).body.data.id;

    const res = await add(adminCookie, child, { title: '두 번째 단계' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/하위 업무 아래/);
  });

  it('업무용이 아닌 게시판에서는 붙이지 못한다', async () => {
    await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
    const parent = await create(adminCookie, `업무아님 ${Date.now()}`);

    const res = await add(adminCookie, parent, { title: '안 될 일' });

    await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
    expect(res.status).toBe(400);
  });

  it('담당자 지정이 거절되면 하위 업무도 남지 않는다', async () => {
    // subsecret 은 admin 만 읽는다. 그 게시판을 못 보는 사람을 담당자로 넣으면 지정이 거절된다.
    const parent = await create(adminCookie, `되돌리기 ${Date.now()}`, 'subsecret');

    const res = await add(
      adminCookie,
      parent,
      { title: '맡길 수 없는 일', assigneeId: 'testuser' },
      'subsecret'
    );

    expect(res.status).toBe(400);
    // 거절해 놓고 글만 만들어 두면, 담당자를 고쳐 다시 누를 때마다 빈 하위가 쌓인다.
    expect((await list(adminCookie, parent, 'subsecret')).body.data).toHaveLength(0);
  });
});

describe('권한', () => {
  it('상위를 바꿀 수 없는 사람은 붙이지 못한다', async () => {
    const parent = await create(adminCookie, `남의업무 ${Date.now()}`);

    const res = await add(userCookie, parent, { title: '끼워 넣기' });

    expect(res.status).toBe(403);
    expect((await list(adminCookie, parent)).body.data).toHaveLength(0);
  });

  it('담당자가 되면 붙일 수 있다 — 바꿀 수 있는 사람과 같은 규칙', async () => {
    const parent = await create(adminCookie, `담당자추가 ${Date.now()}`);
    await setTask(adminCookie, parent, { assigneeId: 'testuser' }).expect(200);

    await add(userCookie, parent, { title: '담당자가 쪼갠 일' }).expect(201);
  });
});

describe('떼어 내기', () => {
  it('떼어 내면 목록에서 빠지지만 글은 남는다', async () => {
    const parent = await create(adminCookie, `떼기 ${Date.now()}`);
    const childId = (await add(adminCookie, parent, { title: '떼어 낼 일' })).body.data.id;

    await detach(adminCookie, parent, childId).expect(200);

    expect((await list(adminCookie, parent)).body.data).toHaveLength(0);
    const still = await Post.findByPk(childId);
    expect(still).not.toBeNull();
    expect(still?.parentTaskId).toBeNull();
  });

  it('남의 하위를 아무나 떼어 내지 못한다', async () => {
    const parent = await create(adminCookie, `떼기권한 ${Date.now()}`);
    const childId = (await add(adminCookie, parent, { title: '지킬 일' })).body.data.id;

    await detach(userCookie, parent, childId).expect(403);
    expect((await list(adminCookie, parent)).body.data).toHaveLength(1);
  });

  it('상위가 다르면 404 — 번호만 안다고 떼어 내지 못한다', async () => {
    const a = await create(adminCookie, `딴상위A ${Date.now()}`);
    const b = await create(adminCookie, `딴상위B ${Date.now()}`);
    const childId = (await add(adminCookie, a, { title: 'A 의 하위' })).body.data.id;

    await detach(adminCookie, b, childId).expect(404);
  });
});

// 라우터는 주소에 적힌 게시판의 읽기 권한만 본다. 읽을 수 있는 게시판 주소에 다른 게시판
// 글의 id 를 끼워 넣으면, 그 글의 하위 목록이 새 나가면 안 된다(역링크에서 막은 것과 같은 구멍).
describe('주소를 바꿔치기해도 새지 않는다', () => {
  it('못 읽는 게시판 글의 하위 목록을 읽을 수 있는 게시판 주소로 엿볼 수 없다', async () => {
    const hidden = await create(adminCookie, `비공개 상위 ${Date.now()}`, 'subsecret');
    await add(adminCookie, hidden, { title: '안쪽 하위' }, 'subsecret').expect(201);

    // 'notice' 는 testuser 도 읽는다. 거기에 다른 게시판 글의 id 를 끼워 넣어 본다.
    const res = await list(userCookie, hidden, 'notice');

    expect(res.status).toBe(404);
  });

  it('주소의 게시판이 다르면 하위를 붙이지도 못한다', async () => {
    const hidden = await create(adminCookie, `비공개 상위2 ${Date.now()}`, 'subsecret');

    await add(adminCookie, hidden, { title: '끼워 넣기' }, 'notice').expect(404);
  });

  it('주소의 게시판이 다르면 떼어 내지도 못한다', async () => {
    const hidden = await create(adminCookie, `비공개 상위3 ${Date.now()}`, 'subsecret');
    const childId = (await add(adminCookie, hidden, { title: '안쪽 하위' }, 'subsecret')).body.data
      .id;

    await detach(adminCookie, hidden, childId, 'notice').expect(404);
  });
});

describe('쓰기 권한', () => {
  it('읽기만 되는 게시판에서는 담당자라도 하위를 만들지 못한다 — 하위도 글이다', async () => {
    const parent = await create(adminCookie, `읽기전용 ${Date.now()}`, 'subreadonly');
    await setTask(adminCookie, parent, { assigneeId: 'testuser' }, 'subreadonly').expect(200);

    const res = await add(userCookie, parent, { title: '몰래 쓴 글' }, 'subreadonly');

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/글을 쓸 권한/);
  });
});

describe('목록', () => {
  it('끝난 하위도 함께 온다 — 몇 개 중 몇 개인지 세어야 한다', async () => {
    const parent = await create(adminCookie, `세기 ${Date.now()}`);
    const first = (await add(adminCookie, parent, { title: '끝낼 일' })).body.data.id;
    await add(adminCookie, parent, { title: '남은 일' }).expect(201);
    await setTask(adminCookie, first, { workStatus: 'done' }).expect(200);

    const rows = (await list(adminCookie, parent)).body.data;
    expect(rows).toHaveLength(2);
    expect(rows.filter((t: { workStatus: string }) => t.workStatus === 'done')).toHaveLength(1);
  });

  it('글을 볼 수 있으면 하위도 본다', async () => {
    const parent = await create(adminCookie, `읽기 ${Date.now()}`);
    await add(adminCookie, parent, { title: '보이는 하위' }).expect(201);

    const res = await list(userCookie, parent);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('로그인하지 않으면 401', async () => {
    const parent = await create(adminCookie, `비로그인 ${Date.now()}`);
    await request(app).get(`/api/posts/notice/${parent}/subtasks`).expect(401);
  });

  // 상위를 업무에서 빼면(workStatus 'none') 하위는 어디에도 딸리지 않은 채로 남는다.
  // 업무 목록·간트·칸반은 업무인 글만 보여 주므로 상위가 사라지고, 하위만 맨 윗단에
  // 떠서 무엇에 딸린 일인지 알 수 없게 된다. 실제 그런 데이터가 만들어져 있었다.
  it('하위가 있으면 상위를 업무에서 뺄 수 없다', async () => {
    const parent = await create(adminCookie, `빼기 ${Date.now()}`);
    await setTask(adminCookie, parent, { workStatus: 'todo' }).expect(200);
    const child = (await add(adminCookie, parent, { title: '남는 하위' })).body.data.id;

    const res = await setTask(adminCookie, parent, { workStatus: 'none' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/하위 업무/);

    // 떼어 내면 뺄 수 있다 — 막는 것이지 영영 못 하게 하는 것이 아니다.
    await detach(adminCookie, parent, child).expect(200);
    await setTask(adminCookie, parent, { workStatus: 'none' }).expect(200);
  });

  it('하위가 있어도 다른 상태로는 바꿀 수 있다 — 대조', async () => {
    const parent = await create(adminCookie, `상태바꾸기 ${Date.now()}`);
    await add(adminCookie, parent, { title: '하위' }).expect(201);
    await setTask(adminCookie, parent, { workStatus: 'done' }).expect(200);
  });
});
