// 업무 공유 보기 — 들어갈 수 있는 업무 게시판 전부를 한 장으로.
//
// 지금까지 업무는 '담당자가 나인 것' 아니면 '게시판 하나' 로만 볼 수 있었다. 공용으로
// 쓰려면 한 장이 필요하다. 다만 '한 장' 이 권한을 넘는 창이 되면 안 된다 —
// 못 들어가는 게시판, 업무용이 아닌 게시판, 볼 수 없는 비밀글은 그대로 가려야 한다.
//
// 스위치는 화면에서만 숨기지 않고 이 길 자체를 막는다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Board } from '../models/Board';
import { BoardAccess } from '../models/BoardAccess';
import { Post } from '../models/Post';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

const OPEN = 'sharedopen'; // user 가 들어갈 수 있는 업무 게시판
const CLOSED = 'sharedclosed'; // 관리자만 들어가는 업무 게시판
const PLAIN = 'sharedplain'; // 업무용이 아닌 게시판

let adminCookie: string;
let userCookie: string;

async function makeBoard(id: string, taskEnabled: boolean, roles: string[]) {
  await Board.destroy({ where: { id }, force: true });
  await Board.create({
    id,
    name: id,
    description: id,
    isPersonal: false,
    isActive: true,
    order: 50,
    taskEnabled,
  } as never);
  for (const roleId of roles) {
    await BoardAccess.findOrCreate({
      where: { boardId: id, roleId },
      defaults: { boardId: id, roleId, canRead: true, canWrite: true, canDelete: true },
    });
  }
}

/** 글을 쓰고 담당자를 붙인다. */
async function makeTask(board: string, cookie: string, title: string, assigneeId: string) {
  const post = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: '<p>x</p>' });
  expect(post.status).toBe(201);
  const id = post.body.data.id as string;
  const task = await request(app)
    .patch(`/api/posts/${board}/${id}/task`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ assigneeId, workStatus: 'todo' });
  expect(task.status).toBe(200);
  return id;
}

const setFlag = async (key: string, enabled: boolean) => {
  await FeatureFlag.destroy({ where: { key } });
  await FeatureFlag.create({ key, enabled });
  featureFlagService.invalidate();
};

const listAll = (cookie: string) => request(app).get('/api/posts/tasks/all').set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  await setFlag('post.tasks', true);
  await setFlag('post.tasksShared', true);
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  await makeBoard(OPEN, true, ['admin', 'user']);
  await makeBoard(CLOSED, true, ['admin']);
  await makeBoard(PLAIN, false, ['admin', 'user']);

  await makeTask(OPEN, adminCookie, '열린 게시판 · 관리자 업무', 'admin');
  await makeTask(OPEN, userCookie, '열린 게시판 · 내 업무', 'testuser');
  await makeTask(CLOSED, adminCookie, '닫힌 게시판 업무', 'admin');
  // 업무용이 아닌 게시판에는 담당자를 붙일 수 없다(서버가 400). 글만 둔다.
  await request(app)
    .post(`/api/posts/${PLAIN}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title: '업무용 아닌 게시판 글', content: '<p>x</p>' });
});

const titles = (res: { body: { data: Array<{ title: string }> } }) =>
  res.body.data.map(t => t.title);

describe('공유 보기가 보여 주는 범위', () => {
  it('내 업무가 아니어도 같은 게시판의 업무면 보인다', async () => {
    const res = await listAll(userCookie);

    expect(res.status).toBe(200);
    expect(titles(res)).toContain('열린 게시판 · 관리자 업무');
    expect(titles(res)).toContain('열린 게시판 · 내 업무');
  });

  it('들어갈 수 없는 게시판의 업무는 보이지 않는다', async () => {
    const res = await listAll(userCookie);
    expect(titles(res)).not.toContain('닫힌 게시판 업무');

    // 양성 대조 — 들어갈 수 있는 사람에게는 보인다
    expect(titles(await listAll(adminCookie))).toContain('닫힌 게시판 업무');
  });

  it('업무용이 아닌 게시판의 글은 끼지 않는다', async () => {
    expect(titles(await listAll(adminCookie))).not.toContain('업무용 아닌 게시판 글');
  });

  it('남의 업무는 바꿀 수 없다고 함께 알려 준다', async () => {
    const res = await listAll(userCookie);
    const rows = res.body.data as Array<{ title: string; canEdit: boolean }>;

    expect(rows.find(t => t.title === '열린 게시판 · 내 업무')?.canEdit).toBe(true);
    expect(rows.find(t => t.title === '열린 게시판 · 관리자 업무')?.canEdit).toBe(false);
  });

  it('볼 수 없는 비밀글의 업무는 제목도 새지 않는다', async () => {
    const secret = await request(app)
      .post(`/api/posts/${OPEN}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '비밀 업무 제목입니다',
        content: '<p>x</p>',
        isSecret: true,
        secretType: 'users',
        secretUserIds: ['admin'],
      });
    const id = secret.body.data.id as string;
    await request(app)
      .patch(`/api/posts/${OPEN}/${id}/task`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ assigneeId: 'admin', workStatus: 'todo' });

    const res = await listAll(userCookie);
    expect(JSON.stringify(res.body.data)).not.toContain('비밀 업무 제목입니다');

    await Post.destroy({ where: { id }, force: true });
  });
});

describe('공유 보기 스위치', () => {
  afterEach(async () => {
    await setFlag('post.tasksShared', true);
  });

  it('끄면 데이터까지 막힌다 — 화면에서만 숨기지 않는다', async () => {
    await setFlag('post.tasksShared', false);

    const res = await listAll(userCookie);
    expect(res.status).toBe(403);
  });

  it('업무 기능 자체를 끄면 공유 보기도 함께 막힌다', async () => {
    await setFlag('post.tasks', false);
    try {
      expect((await listAll(userCookie)).status).toBe(403);
    } finally {
      await setFlag('post.tasks', true);
    }
  });

  it('켜져 있으면 통한다 — 양성 대조', async () => {
    expect((await listAll(userCookie)).status).toBe(200);
  });
});
