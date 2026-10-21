import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import { Post } from '../models/Post';
import { Op } from 'sequelize';

// 목록에서 하위 업무를 상위 아래로 접는다.
//
// 접기 전에는 하위가 만든 시각 순으로 흩어졌다. 상위가 3쪽에 있는데 하위만 1쪽에
// 떠서, 그 줄만 보면 무엇에 딸린 일인지 알 수 없었다.
//
// 지켜야 하는 선:
//  1. 그냥 볼 때는 맨 윗단만. 쪽수도 맨 윗단으로 센다 — 안 그러면 '9개' 라면서 7개만 나온다.
//  2. 거를 때는 접지 않는다. 검색어에 맞는 하위가 접힌 줄에 숨으면 '없다' 로 보인다.
//  3. 거를 때 하위 줄에는 상위 제목을 붙인다 — 혼자 떠 있으면 맥락이 없다.
//  4. 펼치기 전에도 개수를 안다('3개 중 1개 끝남').

const BOARD = 'notice';
let adminCookie: string;

const create = async (title: string) => {
  const res = await request(app)
    .post(`/api/posts/${BOARD}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};

const addSub = async (parentId: string, title: string) => {
  const res = await request(app)
    .post(`/api/posts/${BOARD}/${parentId}/subtasks`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};

const listPosts = async (query = '') => {
  const res = await request(app)
    .get(`/api/posts/${BOARD}?limit=100${query}`)
    .set('Cookie', adminCookie);
  expect(res.status).toBe(200);
  return res.body.data as {
    posts: {
      id: string;
      title: string;
      subtaskCount: number;
      subtaskDoneCount: number;
      parentTask: { id: string; title: string } | null;
    }[];
    pagination: { totalCount: number };
  };
};

let parentId: string;
let childA: string;
let childB: string;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  await Board.update({ taskEnabled: true }, { where: { id: BOARD } });
  // 상위가 옮겨 갈 다른 게시판
  await Board.findOrCreate({
    where: { id: 'treeother' },
    defaults: { id: 'treeother', name: '다른 게시판', order: 94, taskEnabled: true },
  });

  parentId = await create('트리상위 현장점검');
  childA = await addSub(parentId, '트리하위 자재확인');
  childB = await addSub(parentId, '트리하위 사진촬영');
  await Post.update({ workStatus: 'done' }, { where: { id: childB } });
});

describe('목록에서 하위 업무 접기', () => {
  it('그냥 볼 때는 하위가 맨 윗단에 끼지 않는다', async () => {
    const { posts } = await listPosts();
    const ids = posts.map(p => p.id);
    expect(ids).toContain(parentId);
    expect(ids).not.toContain(childA);
    expect(ids).not.toContain(childB);
  });

  it('쪽수도 맨 윗단으로 센다 — 하위를 빼고 센다', async () => {
    const { posts, pagination } = await listPosts();
    const published = await Post.count({ where: { boardType: BOARD, status: 'published' } });
    const children = await Post.count({
      where: { boardType: BOARD, status: 'published', parentTaskId: { [Op.ne]: null } },
    });
    expect(children).toBeGreaterThan(0);
    // 전체에서 하위를 뺀 수와 같아야 한다. 줄 수와만 맞춰 보면 둘 다 하위를
    // 세고 있어도 통과하므로, 바깥에서 센 값과 맞춘다.
    expect(pagination.totalCount).toBe(published - children);
    expect(posts.length).toBe(pagination.totalCount);
  });

  it('펼치기 전에도 하위 개수와 끝난 개수를 안다', async () => {
    const { posts } = await listPosts();
    const parent = posts.find(p => p.id === parentId)!;
    expect(parent.subtaskCount).toBe(2);
    expect(parent.subtaskDoneCount).toBe(1);
  });

  it('하위가 없는 글은 0 이다 — 삼각형을 그리지 않게', async () => {
    const plain = await create('트리없음 그냥글');
    const { posts } = await listPosts();
    const row = posts.find(p => p.id === plain)!;
    expect(row.subtaskCount).toBe(0);
    expect(row.parentTask).toBeNull();
  });

  it('검색하면 하위도 결과에 나온다 — 접힌 줄에 숨지 않게', async () => {
    const { posts } = await listPosts('&search=트리하위 자재확인');
    expect(posts.map(p => p.id)).toContain(childA);
  });

  it('검색 결과의 하위 줄에는 상위 제목이 붙는다', async () => {
    const { posts } = await listPosts('&search=트리하위 자재확인');
    const row = posts.find(p => p.id === childA)!;
    expect(row.parentTask).toEqual({ id: parentId, title: '트리상위 현장점검' });
  });

  it('업무 상태로 걸러도 하위가 나온다', async () => {
    const { posts } = await listPosts('&workStatus=done');
    expect(posts.map(p => p.id)).toContain(childB);
  });

  // 글은 게시판을 옮길 수 있는데(updatePost 의 targetBoardType) 옮겨도 parentTaskId 는
  // 남는다. 거르지 않으면 못 들어가는 게시판의 제목이 이 줄에 실려 나간다.
  it('다른 게시판으로 옮겨 간 상위의 제목은 붙이지 않는다', async () => {
    const parent = await create('트리상위 옮겨질것');
    const child = await addSub(parent, '트리하위 남는것');
    await Post.update({ boardType: 'treeother' }, { where: { id: parent } });

    const { posts } = await listPosts('&search=트리하위 남는것');
    const row = posts.find(p => p.id === child)!;
    expect(row).toBeDefined();
    expect(row.parentTask).toBeNull();

    await Post.update({ boardType: BOARD }, { where: { id: parent } });
  });

  // 직접 쓴 SQL 이라 paranoid 가 붙여 주는 deletedAt 조건이 없다. 빼먹으면 펼쳐도
  // 아무것도 없는데 '하위 0/1' 이라고 적힌 줄이 남는다.
  it('지운 하위는 세지 않는다', async () => {
    const parent = await create('트리상위 셈하기');
    const a = await addSub(parent, '트리하위 남을것');
    await addSub(parent, '트리하위 지울것');
    expect((await listPosts()).posts.find(p => p.id === parent)!.subtaskCount).toBe(2);

    const res = await request(app)
      .delete(`/api/posts/${BOARD}/${a}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    expect((await listPosts()).posts.find(p => p.id === parent)!.subtaskCount).toBe(1);
  });

  it('떼어 내면 다시 맨 윗단으로 올라온다', async () => {
    const solo = await create('트리상위 떼어낼것');
    const child = await addSub(solo, '트리하위 떼어질것');
    expect((await listPosts()).posts.map(p => p.id)).not.toContain(child);

    const res = await request(app)
      .delete(`/api/posts/${BOARD}/${solo}/subtasks/${child}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    expect((await listPosts()).posts.map(p => p.id)).toContain(child);
  });
});
