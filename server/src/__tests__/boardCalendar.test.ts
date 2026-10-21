// 게시판마다 가지는 달력.
//
// 전사 공유 달력 하나뿐이던 일정에 게시판을 붙였다(Event.boardId). 권한이 갈린다 —
// 게시판 일정은 역할별 EventPermission 이 아니라 그 게시판의 접근 권한을 따른다.
// 그래야 '게시판에 글을 쓸 수 있으면 일정도 세운다' 가 성립한다.
//
// 지켜야 하는 선:
//  1. 공유 달력은 게시판 일정을 보여 주지 않는다 — 못 읽는 게시판의 회의 제목이 새면 안 된다.
//  2. 게시판 달력은 그 게시판 것만 준다.
//  3. 못 읽는 게시판의 달력은 열리지 않는다.
//  4. 쓰기 권한이 없으면 일정을 세우지 못한다.
//  5. 역할에 일정 권한이 없어도 게시판에 쓸 수 있으면 세운다(그 반대도 — 역할 권한이 있어도
//     남의 게시판 일정에는 손대지 못한다).
//  6. 달력을 켜지 않은 게시판에는 일정이 쌓이지 않는다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { BoardManager } from '../models/BoardManager';
import Event from '../models/Event';
import EventPermission from '../models/EventPermission';
import { User } from '../models/User';

const RANGE = { start: '2026-07-01T00:00:00.000Z', end: '2026-07-31T00:00:00.000Z' };

let adminCookie: string;
let userCookie: string;
let outsiderCookie: string;

const list = (cookie: string, boardId?: string) =>
  request(app)
    .get('/api/events')
    .query(boardId ? { ...RANGE, boardId } : RANGE)
    .set('Cookie', cookie);

const create = (cookie: string, body: Record<string, unknown>) =>
  request(app)
    .post('/api/events')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({
      calendarId: 'default',
      title: '회의',
      isAllday: false,
      start: '2026-07-10T01:00:00.000Z',
      end: '2026-07-10T02:00:00.000Z',
      ...body,
    });

const titles = (res: { body: { data: Array<{ title: string }> } }) =>
  res.body.data.map(e => e.title);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  // 바깥 사람 — 어느 게시판에도 접근 권한이 없는 역할
  if (!(await User.findByPk('outsider'))) {
    await User.create({
      id: 'outsider',
      password: 'TestUser123!',
      name: '바깥사람',
      email: 'outsider@test.com',
      roleId: 'guest',
      isActive: true,
    });
  }
  outsiderCookie = await loginAs('outsider', 'TestUser123!');

  // 바깥 사람에게도 게시판 하나는 준다. 접근 가능한 게시판이 아예 없으면 전역 검색이
  // 조기 반환해서, 일정이 걸러진 것인지 검색 자체가 멈춘 것인지 구별되지 않는다.
  await BoardAccess.findOrCreate({
    where: { boardId: 'notice', roleId: 'guest' },
    defaults: {
      boardId: 'notice',
      roleId: 'guest',
      canRead: true,
      canWrite: false,
      canDelete: false,
    },
  });

  // 달력을 켠 게시판. user 는 읽기·쓰기가 된다.
  await Board.findOrCreate({
    where: { id: 'calboard' },
    defaults: {
      id: 'calboard',
      name: '달력 게시판',
      description: '',
      isActive: true,
      isPersonal: false,
      order: 90,
      calendarEnabled: true,
    },
  });
  await Board.update({ calendarEnabled: true }, { where: { id: 'calboard' } });
  await BoardAccess.destroy({ where: { boardId: 'calboard' } });
  await BoardAccess.bulkCreate([
    { boardId: 'calboard', roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
    { boardId: 'calboard', roleId: 'user', canRead: true, canWrite: true, canDelete: false },
  ]);

  // 읽기만 되는 달력 게시판
  await Board.findOrCreate({
    where: { id: 'calread' },
    defaults: {
      id: 'calread',
      name: '읽기 전용 달력',
      description: '',
      isActive: true,
      isPersonal: false,
      order: 91,
      calendarEnabled: true,
    },
  });
  await Board.update({ calendarEnabled: true }, { where: { id: 'calread' } });
  await BoardAccess.destroy({ where: { boardId: 'calread' } });
  await BoardAccess.bulkCreate([
    { boardId: 'calread', roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
    { boardId: 'calread', roleId: 'user', canRead: true, canWrite: false, canDelete: false },
  ]);

  // 달력을 켜지 않은 게시판
  await Board.update({ calendarEnabled: false }, { where: { id: 'notice' } });

  // 달력도 끄고 바깥 사람은 읽지도 못하는 게시판 — 403 과 400 이 갈리는지 보는 자리
  await Board.findOrCreate({
    where: { id: 'nocal_secret' },
    defaults: {
      id: 'nocal_secret',
      name: '달력 없는 비공개',
      description: '',
      isActive: true,
      isPersonal: false,
      order: 92,
      calendarEnabled: false,
    },
  });
  await BoardAccess.destroy({ where: { boardId: 'nocal_secret' } });
  await BoardAccess.create({
    boardId: 'nocal_secret',
    roleId: 'admin',
    canRead: true,
    canWrite: true,
    canDelete: true,
  });
});

describe('범위 — 공유 달력과 게시판 달력은 섞이지 않는다', () => {
  it('공유 달력은 게시판 일정을 보여 주지 않는다', async () => {
    await Event.create({
      calendarId: 'default',
      title: '게시판만의 회의',
      isAllday: false,
      start: new Date('2026-07-05T01:00:00.000Z'),
      end: new Date('2026-07-05T02:00:00.000Z'),
      isReadOnly: false,
      UserId: 'admin',
      boardId: 'calboard',
    });
    await Event.create({
      calendarId: 'default',
      title: '전사 워크숍',
      isAllday: false,
      start: new Date('2026-07-06T01:00:00.000Z'),
      end: new Date('2026-07-06T02:00:00.000Z'),
      isReadOnly: false,
      UserId: 'admin',
    });

    const res = await list(adminCookie);

    expect(res.status).toBe(200);
    expect(titles(res)).toContain('전사 워크숍');
    expect(titles(res)).not.toContain('게시판만의 회의');
  });

  it('게시판 달력은 그 게시판 것만 준다', async () => {
    await Event.create({
      calendarId: 'default',
      title: '다른 게시판 회의',
      isAllday: false,
      start: new Date('2026-07-07T01:00:00.000Z'),
      end: new Date('2026-07-07T02:00:00.000Z'),
      isReadOnly: false,
      UserId: 'admin',
      boardId: 'calread',
    });

    const res = await list(adminCookie, 'calboard');

    expect(res.status).toBe(200);
    expect(titles(res)).toContain('게시판만의 회의');
    expect(titles(res)).not.toContain('다른 게시판 회의');
    expect(titles(res)).not.toContain('전사 워크숍');
  });
});

describe('반복 일정', () => {
  it("'이 날만' 떼어 낸 하루도 같은 게시판에 남는다", async () => {
    const made = await create(adminCookie, {
      boardId: 'calboard',
      title: '주간 회의',
      recurrenceType: 'weekly',
      recurrenceDays: [1],
      recurrenceEndDate: '2026-08-31T00:00:00.000Z',
    });
    expect(made.status).toBe(201);

    const res = await request(app)
      .put(`/api/events/${made.body.data.id}/occurrences/2026-07-13`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '그 주만 다른 회의',
        start: '2026-07-13T05:00:00.000Z',
        end: '2026-07-13T06:00:00.000Z',
        isAllday: false,
      });

    // 떨어져 나온 하루는 새로 선 일정이라 201 이다
    expect(res.status).toBe(201);
    // 비워 두면 전사 공유 달력으로 새어 나간다
    expect(res.body.data.boardId).toBe('calboard');

    const shared = await list(adminCookie);
    expect(titles(shared)).not.toContain('그 주만 다른 회의');
    const board = await list(adminCookie, 'calboard');
    expect(titles(board)).toContain('그 주만 다른 회의');
  });
});

describe('게시판을 지우면', () => {
  it('그 게시판의 일정도 함께 사라진다', async () => {
    await Board.findOrCreate({
      where: { id: 'caltemp' },
      defaults: {
        id: 'caltemp',
        name: '없어질 게시판',
        description: '',
        isActive: true,
        isPersonal: false,
        order: 99,
        calendarEnabled: true,
      },
    });
    const doomed = await Event.create({
      calendarId: 'default',
      title: '사라질 회의',
      isAllday: false,
      start: new Date('2026-07-21T01:00:00.000Z'),
      end: new Date('2026-07-21T02:00:00.000Z'),
      isReadOnly: false,
      UserId: 'admin',
      boardId: 'caltemp',
    });

    await request(app)
      .delete('/api/admin/boards/caltemp')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .expect(200);

    // 남겨 두면 어느 달력에도 뜨지 않고, 같은 id 로 다시 만들면 되살아난다
    expect(await Event.findByPk(doomed.id)).toBeNull();
  });
});

describe('전역 검색 — 달력에서 막은 것이 검색으로 뚫리지 않는다', () => {
  const search = (cookie: string, q: string) =>
    request(app).get('/api/posts/search/global').query({ q }).set('Cookie', cookie);

  it('못 읽는 게시판의 일정은 검색에 나오지 않는다', async () => {
    await Event.create({
      calendarId: 'default',
      title: '비공개게시판분기보고회의',
      isAllday: false,
      start: new Date('2026-07-20T01:00:00.000Z'),
      end: new Date('2026-07-20T02:00:00.000Z'),
      isReadOnly: false,
      UserId: 'admin',
      boardId: 'calboard',
    });
    // 역할에 일정 읽기를 켜 둔다 — 예전에는 이것만으로 모든 일정이 검색됐다.
    await EventPermission.destroy({ where: { roleId: 'guest' } });
    await EventPermission.create({
      roleId: 'guest',
      canCreate: false,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    });

    // 대조군 — 이 사람도 검색 자체는 된다(조기 반환이 아니다).
    const control = await search(outsiderCookie, '공지');
    expect(control.status).toBe(200);

    const res = await search(outsiderCookie, '비공개게시판분기보고회의');

    expect(res.status).toBe(200);
    const titles: string[] = (res.body.data?.results ?? res.body.data ?? []).map(
      (r: { title: string }) => r.title
    );
    expect(titles).not.toContain('비공개게시판분기보고회의');
  });

  it('들어갈 수 있는 게시판의 일정은 검색된다', async () => {
    const res = await search(userCookie, '비공개게시판분기보고회의');
    const titles: string[] = (res.body.data?.results ?? res.body.data ?? []).map(
      (r: { title: string }) => r.title
    );
    expect(titles).toContain('비공개게시판분기보고회의');
  });
});

describe('권한 — 게시판 접근을 따른다', () => {
  it('못 읽는 게시판의 달력은 열리지 않는다', async () => {
    const res = await list(outsiderCookie, 'calboard');
    expect(res.status).toBe(403);
  });

  it('달력을 껐는지까지 알려 주지 않는다 — 못 읽는 게시판은 언제나 403', async () => {
    // 달력을 켜지 않은 게시판(notice)을 바깥 사람이 물으면, 400('달력이 아니다')으로 답하면
    // 그 게시판이 있다는 것과 설정까지 알려 주는 셈이다.
    const res = await list(outsiderCookie, 'nocal_secret');
    expect(res.status).toBe(403);
  });

  it('달력을 켜지 않은 게시판에는 일정이 쌓이지 않는다', async () => {
    const res = await create(adminCookie, { boardId: 'notice', title: '꺼진 달력' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/달력/);
  });

  it('쓰기 권한이 없으면 일정을 세우지 못한다', async () => {
    const res = await create(userCookie, { boardId: 'calread', title: '읽기전용에 쓰기' });
    expect(res.status).toBe(403);
    expect(await Event.count({ where: { title: '읽기전용에 쓰기' } })).toBe(0);
  });

  it('역할에 일정 생성 권한이 없어도 게시판에 쓸 수 있으면 세운다', async () => {
    // 역할 권한을 모두 닫아 둔다 — 공유 달력이었다면 거절될 사람이다.
    await EventPermission.destroy({ where: { roleId: 'user' } });
    await EventPermission.create({
      roleId: 'user',
      canCreate: false,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    });

    const blocked = await create(userCookie, { title: '공유 달력에 쓰기' });
    expect(blocked.status).toBe(403);

    const allowed = await create(userCookie, { boardId: 'calboard', title: '게시판에 쓰기' });
    expect(allowed.status).toBe(201);
    expect(allowed.body.data.boardId).toBe('calboard');
  });

  it('역할에 수정 권한이 있어도 남의 게시판 일정은 고치지 못한다', async () => {
    await EventPermission.destroy({ where: { roleId: 'user' } });
    await EventPermission.create({
      roleId: 'user',
      canCreate: true,
      canRead: true,
      // 공유 달력에서는 남의 일정도 고칠 수 있는 역할이다
      canUpdate: true,
      canDelete: true,
    });
    const mine = await Event.create({
      calendarId: 'default',
      title: '남의 게시판 일정',
      isAllday: false,
      start: new Date('2026-07-08T01:00:00.000Z'),
      end: new Date('2026-07-08T02:00:00.000Z'),
      isReadOnly: false,
      UserId: 'admin',
      boardId: 'calread',
    });

    const res = await request(app)
      .put(`/api/events/${mine.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ title: '가로챈 제목' });

    expect(res.status).toBe(403);
    await mine.reload();
    expect(mine.title).toBe('남의 게시판 일정');
  });

  it('게시판 관리자는 그 게시판 일정을 고친다', async () => {
    await BoardManager.findOrCreate({
      where: { boardId: 'calread', userId: 'testuser' },
      defaults: { boardId: 'calread', userId: 'testuser' },
    });
    const target = await Event.create({
      calendarId: 'default',
      title: '관리자가 고칠 일정',
      isAllday: false,
      start: new Date('2026-07-09T01:00:00.000Z'),
      end: new Date('2026-07-09T02:00:00.000Z'),
      isReadOnly: false,
      UserId: 'admin',
      boardId: 'calread',
    });

    const res = await request(app)
      .put(`/api/events/${target.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ title: '고쳐진 일정' });

    expect(res.status).toBe(200);
    await target.reload();
    expect(target.title).toBe('고쳐진 일정');
    await BoardManager.destroy({ where: { boardId: 'calread', userId: 'testuser' } });
  });

  it('자기가 세운 게시판 일정은 스스로 고친다', async () => {
    const made = await create(userCookie, { boardId: 'calboard', title: '내가 세운 일정' });
    expect(made.status).toBe(201);

    const res = await request(app)
      .put(`/api/events/${made.body.data.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ title: '내가 고친 일정' });

    expect(res.status).toBe(200);
  });

  it('게시판은 만들 때 정해진다 — 수정으로 옮기지 못한다', async () => {
    const made = await create(adminCookie, { boardId: 'calboard', title: '옮겨 볼 일정' });
    expect(made.status).toBe(201);

    await request(app)
      .put(`/api/events/${made.body.data.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ boardId: null, title: '옮겨 볼 일정' })
      .expect(200);

    const after = await Event.findByPk(made.body.data.id);
    expect(after?.boardId).toBe('calboard');
  });
});
