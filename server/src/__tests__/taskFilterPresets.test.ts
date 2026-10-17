import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { TaskFilterPreset } from '../models/TaskFilterPreset';
import { MAX_PRESETS, sanitizePreset } from '../config/taskFilterPreset';

// 저장된 업무 필터(지라의 saved filter). '긴급 + 이번 주 마감 + 품질 게시판' 같은 조건에
// 이름을 붙여 둔다.
//
// 지켜야 하는 선:
//  1. 내 것만 보이고, 내 것만 지운다 — 번호로 남의 필터를 떠볼 수 없게 한다.
//  2. 아는 값만 저장한다. 모르는 조건은 '조건 없음' 으로 깎는다(저장 자체가 막히면 손쓸 길이 없다).
//  3. 같은 이름으로 다시 저장하면 덮어쓴다 — 같은 이름이 둘 보이지 않게.
//  4. 개수에 상한이 있다.

let userCookie: string;
let otherCookie: string;

const list = (cookie: string) =>
  request(app).get('/api/users/me/task-filters').set('Cookie', cookie);

const save = (cookie: string, body: unknown) =>
  request(app)
    .post('/api/users/me/task-filters')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body as object);

const remove = (cookie: string, id: number) =>
  request(app).delete(`/api/users/me/task-filters/${id}`).set(CSRF_HEADER).set('Cookie', cookie);

const URGENT_THIS_WEEK = {
  name: '긴급 이번 주',
  scope: '',
  query: '견적',
  boardType: 'notice',
  due: 'week',
  priority: 'urgent',
  sort: 'priority',
};

beforeAll(async () => {
  await seedTestData();
  userCookie = await loginAs('testuser', 'TestUser123!');
  otherCookie = await loginAs('admin', 'TestAdmin123!');
});

beforeEach(async () => {
  await TaskFilterPreset.destroy({ where: {} });
});

describe('값 깎기', () => {
  it('아는 값은 그대로 남는다', () => {
    expect(sanitizePreset(URGENT_THIS_WEEK)).toEqual(URGENT_THIS_WEEK);
  });

  it('이름이 없으면 받지 않는다 — 고르는 메뉴에 쓸 이름이다', () => {
    expect(sanitizePreset({ ...URGENT_THIS_WEEK, name: '   ' })).toBeNull();
    expect(sanitizePreset(null)).toBeNull();
    expect(sanitizePreset(['긴급'])).toBeNull();
  });

  it('모르는 조건은 조건 없음으로 깎는다 — 저장 자체를 막지 않는다', () => {
    expect(
      sanitizePreset({ name: '이상한 것', due: '내일', priority: 'HOT', sort: '아무거나' })
    ).toEqual({
      name: '이상한 것',
      scope: '',
      query: '',
      boardType: '',
      due: null,
      priority: null,
      sort: 'stale',
    });
  });

  it('이름과 검색어는 길이를 자른다', () => {
    const long = sanitizePreset({ name: 'ㄱ'.repeat(80), query: 'ㄴ'.repeat(200) });
    expect(long?.name).toHaveLength(50);
    expect(long?.query).toHaveLength(100);
  });
});

describe('저장과 목록', () => {
  it('저장하면 그대로 다시 읽힌다', async () => {
    const made = await save(userCookie, URGENT_THIS_WEEK);
    expect(made.status).toBe(201);

    const res = await list(userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject(URGENT_THIS_WEEK);
  });

  it('같은 이름으로 다시 저장하면 덮어쓴다 — 같은 이름이 둘 보이지 않게', async () => {
    await save(userCookie, URGENT_THIS_WEEK).expect(201);
    await save(userCookie, { ...URGENT_THIS_WEEK, priority: 'high', query: '' }).expect(200);

    const rows = (await list(userCookie)).body.data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ priority: 'high', query: '' });
  });

  it('이름이 비면 400', async () => {
    await save(userCookie, { ...URGENT_THIS_WEEK, name: '' }).expect(400);
  });

  it(`${MAX_PRESETS}개를 넘기면 더 저장하지 않는다`, async () => {
    for (let i = 0; i < MAX_PRESETS; i += 1) {
      await save(userCookie, { name: `필터 ${i}` }).expect(201);
    }
    const over = await save(userCookie, { name: '하나 더' });
    expect(over.status).toBe(400);
    expect((await list(userCookie)).body.data).toHaveLength(MAX_PRESETS);
  });
});

describe('남의 것', () => {
  it('목록에는 내 것만 온다', async () => {
    await save(userCookie, { name: '내 필터' }).expect(201);
    await save(otherCookie, { name: '남의 필터' }).expect(201);

    expect((await list(userCookie)).body.data.map((f: { name: string }) => f.name)).toEqual([
      '내 필터',
    ]);
  });

  it('남의 필터는 번호를 알아도 지울 수 없고, 없는 것처럼 답한다', async () => {
    const mine = await save(otherCookie, { name: '남의 필터' });
    const id = mine.body.data.id as number;

    await remove(userCookie, id).expect(404);
    expect(await TaskFilterPreset.findByPk(id)).not.toBeNull();
  });

  it('내 필터는 지워진다', async () => {
    const made = await save(userCookie, { name: '지울 필터' });
    await remove(userCookie, made.body.data.id).expect(200);
    expect((await list(userCookie)).body.data).toHaveLength(0);
  });
});

describe('로그인', () => {
  it('로그인하지 않으면 401', async () => {
    await request(app).get('/api/users/me/task-filters').expect(401);
    await request(app)
      .post('/api/users/me/task-filters')
      .set(CSRF_HEADER)
      .send({ name: '몰래' })
      .expect(401);
  });
});
