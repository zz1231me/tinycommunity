import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { sanitizeUiPrefs } from '../config/uiPrefs';

// 보기 설정(업무 보기·정렬 등)을 계정에 저장한다.
//
// 지금까지 브라우저 localStorage 에만 있어서 기기를 바꾸면 초기화됐다. 숨긴 메뉴는
// 계정에 저장하는데 이것만 기기에 남아 있던 것을 맞춘다.
//
// 지켜야 하는 선:
//  1. 아무 JSON 이나 저장하지 않는다 — 아는 키·아는 값만.
//  2. 보낸 키만 덮어쓴다(부분 저장). 한 값을 바꿀 때 나머지가 날아가면 안 된다.
//  3. 남의 설정이 보이거나 섞이지 않는다.
//  4. 보기 설정 때문에 조작이 막히지 않는다 — 모르는 값은 조용히 버린다.

let adminCookie: string;
let userCookie: string;

const get = (cookie: string) => request(app).get('/api/users/me/ui-prefs').set('Cookie', cookie);
const patch = (cookie: string, body: unknown) =>
  request(app)
    .patch('/api/users/me/ui-prefs')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body as object);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

beforeEach(async () => {
  await User.update({ uiPrefs: null }, { where: { id: ['admin', 'testuser'] } });
});

describe('값 걸러내기', () => {
  it('아는 키·아는 값만 남는다', () => {
    expect(
      sanitizeUiPrefs({
        taskView: 'kanban',
        taskSort: 'priority',
        taskShowDone: true,
        taskGanttZoom: 'week',
      })
    ).toEqual({
      taskView: 'kanban',
      taskSort: 'priority',
      taskShowDone: true,
      taskGanttZoom: 'week',
    });
  });

  it('모르는 키·범위 밖 값·엉뚱한 자료형은 버린다', () => {
    expect(
      sanitizeUiPrefs({
        taskView: 'calendar', // 없는 보기
        taskSort: 'priority',
        theme: 'dark', // 여기서 다룰 값이 아니다
        taskShowDone: 'yes', // 자료형 다름
        __proto__: { x: 1 },
      })
    ).toEqual({ taskSort: 'priority' });
  });

  it('객체가 아니면 빈 값', () => {
    expect(sanitizeUiPrefs(null)).toEqual({});
    expect(sanitizeUiPrefs(['kanban'])).toEqual({});
    expect(sanitizeUiPrefs('kanban')).toEqual({});
  });
});

describe('보기 설정 API', () => {
  it('처음에는 빈 값이다', async () => {
    const res = await get(userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });

  it('저장하고 다시 읽는다', async () => {
    await patch(userCookie, { taskView: 'gantt', taskGanttZoom: 'month' }).expect(200);
    expect((await get(userCookie)).body.data).toEqual({
      taskView: 'gantt',
      taskGanttZoom: 'month',
    });
  });

  it('보낸 키만 덮어쓴다 — 나머지는 그대로 남는다', async () => {
    await patch(userCookie, { taskView: 'kanban', taskSort: 'due' }).expect(200);
    await patch(userCookie, { taskSort: 'priority' }).expect(200);

    expect((await get(userCookie)).body.data).toEqual({
      taskView: 'kanban',
      taskSort: 'priority',
    });
  });

  it('모르는 값을 보내도 200 이고, 아는 것만 저장된다', async () => {
    const res = await patch(userCookie, { taskView: 'hologram', taskSort: 'due' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ taskSort: 'due' });
  });

  it('사람마다 따로 저장된다', async () => {
    await patch(userCookie, { taskView: 'kanban' }).expect(200);
    await patch(adminCookie, { taskView: 'gantt' }).expect(200);

    expect((await get(userCookie)).body.data.taskView).toBe('kanban');
    expect((await get(adminCookie)).body.data.taskView).toBe('gantt');
  });

  it('로그인하지 않으면 401', async () => {
    await request(app).get('/api/users/me/ui-prefs').expect(401);
    await request(app)
      .patch('/api/users/me/ui-prefs')
      .set(CSRF_HEADER)
      .send({ taskView: 'list' })
      .expect(401);
  });

  it('깨진 JSON 이 저장돼 있어도 빈 값으로 읽는다', async () => {
    await User.update({ uiPrefs: '{망가짐' }, { where: { id: 'testuser' } });
    expect((await get(userCookie)).body.data).toEqual({});
  });
});
