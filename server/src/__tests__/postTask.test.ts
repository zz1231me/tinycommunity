import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { Notification } from '../models/Notification';
import { PostRead } from '../models/PostRead';
import { SiteSettings } from '../models/SiteSettings';
import { refreshSettingsCache } from '../utils/settingsCache';
import { Post } from '../models/Post';
import { sendDueReminders } from '../services/taskDue.service';

// 담당자·업무 상태와 읽음 확인.
//
// 지켜야 하는 선:
//  1. 아무나 남의 글 담당자를 바꿀 수 없다.
//  2. 못 보는 글의 담당자로 지정할 수 없다 — 알림만 받고 열지 못하는 상태가 된다.
//  3. 읽음 확인은 확인용이지 감시용이 아니다 — 작성자·게시판 담당자만 본다.

let adminCookie: string;
let userCookie: string;
let thirdCookie: string;

async function createPost(cookie: string, title: string, board = 'notice'): Promise<string> {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function setTask(cookie: string, id: string, body: Record<string, unknown>, board = 'notice') {
  return request(app)
    .patch(`/api/posts/${board}/${id}/task`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body);
}

function readers(cookie: string, id: string, board = 'notice') {
  return request(app).get(`/api/posts/${board}/${id}/readers`).set('Cookie', cookie);
}

beforeAll(async () => {
  await seedTestData();
  // 글 작성은 시간당 20건으로 묶여 있어 이 스위트만으로도 예산을 넘긴다

  // 담당자·상태는 업무용으로 켜 둔 게시판에서만 쓴다
  await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });

  // testuser 가 못 보는 게시판 — 담당자 지정 경계 확인용
  await Board.findOrCreate({
    where: { id: 'taskonly' },
    defaults: {
      id: 'taskonly',
      name: '관리자 전용',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      taskEnabled: true,
      order: 7,
    },
  });

  // 업무용이 아닌 일반 게시판 — 경계 확인용
  await Board.findOrCreate({
    where: { id: 'plainboard' },
    defaults: {
      id: 'plainboard',
      name: '일반 게시판',
      description: '업무로 쓰지 않는 게시판',
      isPersonal: false,
      isActive: true,
      taskEnabled: false,
      order: 8,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: 'plainboard', roleId: 'admin' },
    defaults: {
      boardId: 'plainboard',
      roleId: 'admin',
      canRead: true,
      canWrite: true,
      canDelete: true,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: 'taskonly', roleId: 'admin' },
    defaults: {
      boardId: 'taskonly',
      roleId: 'admin',
      canRead: true,
      canWrite: true,
      canDelete: true,
    },
  });

  // 이 스위트에도 제삼자가 필요하다 — 스위트마다 DB 를 다시 만들기 때문에
  // 다른 파일에서 만든 계정은 남아 있지 않다
  const third = await User.findByPk('thirduser');
  if (!third) {
    await User.create({
      id: 'thirduser',
      password: 'TestThird123!',
      name: '제삼자',
      email: 'third@test.com',
      roleId: 'user',
      isActive: true,
    });
  }

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
  thirdCookie = await loginAs('thirduser', 'TestThird123!');
});

afterEach(async () => {
  await Notification.destroy({ where: {} });
  await PostRead.destroy({ where: {} });
});

describe('상태 이름', () => {
  const statuses = (cookie: string) =>
    request(app).get('/api/posts/tasks/statuses').set('Cookie', cookie);

  it('기본은 코드에 적힌 이름이다', async () => {
    const res = await statuses(adminCookie);
    expect(res.body.data.find((s: { key: string }) => s.key === 'doing').label).toBe('진행 중');
  });

  it('관리자가 바꾼 이름이 그대로 내려온다', async () => {
    // 팀마다 '진행 중' 을 '검토 중' 이라 부른다. 그걸 바꾸려고 배포할 수는 없다.
    await SiteSettings.update(
      { workStatusLabels: JSON.stringify({ doing: '검토 중' }) },
      { where: {} }
    );
    await refreshSettingsCache();
    try {
      const res = await statuses(adminCookie);
      const list = res.body.data as Array<{ key: string; label: string }>;
      expect(list.find(s => s.key === 'doing')?.label).toBe('검토 중');
      // 바꾸지 않은 것은 그대로
      expect(list.find(s => s.key === 'todo')?.label).toBe('할 일');
    } finally {
      await SiteSettings.update({ workStatusLabels: '{}' }, { where: {} });
      await refreshSettingsCache();
    }
  });

  it('저장된 값이 깨져 있어도 기본 이름으로 돌아간다 — 이름 하나로 게시판이 막히면 안 된다', async () => {
    await SiteSettings.update({ workStatusLabels: '{ 망가진 json' }, { where: {} });
    await refreshSettingsCache();
    try {
      const res = await statuses(adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.find((s: { key: string }) => s.key === 'done').label).toBe('완료');
    } finally {
      await SiteSettings.update({ workStatusLabels: '{}' }, { where: {} });
      await refreshSettingsCache();
    }
  });

  it.each([
    ['문자열', '진행중'],
    ['배열', ['진행중']],
    ['숫자 라벨', { doing: 12345 }],
    ['너무 긴 이름', { doing: '가'.repeat(21) }],
  ])('잘못된 이름 형식(%s)은 400 — 서버 오류가 아니다', async (_label, value) => {
    // 저장 구문 안에서 검사하면 500 이 나가, 관리자가 입력 문제라는 것을 알 수 없다.
    const res = await request(app)
      .put('/api/site-settings')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ workStatusLabels: value });
    expect(res.status).toBe(400);
  });

  it('키는 코드가 정한 것만 저장된다', async () => {
    const res = await request(app)
      .put('/api/site-settings')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ workStatusLabels: { doing: '검토 중', 없는키: '무시됨' } });
    expect(res.status).toBe(200);

    const saved = JSON.parse((await SiteSettings.findOne())?.workStatusLabels ?? '{}');
    expect(saved).toEqual({ doing: '검토 중' });

    await SiteSettings.update({ workStatusLabels: '{}' }, { where: {} });
    await refreshSettingsCache();
  });
});

describe('게시판 용도', () => {
  it('업무용이 아닌 게시판에서는 상태를 붙일 수 없다', async () => {
    // 모든 게시판이 업무 목록은 아니다. 공지·자유게시판에까지 담당자 줄이 붙으면
    // 쓰지 않는 기능이 화면만 차지한다.
    const id = await createPost(adminCookie, `일반글 ${Date.now()}`, 'plainboard');
    const res = await setTask(adminCookie, id, { workStatus: 'todo' }, 'plainboard');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('업무용');
  });

  it('관리자여도 마찬가지다 — 권한 문제가 아니라 게시판 용도 문제다', async () => {
    const id = await createPost(adminCookie, `일반글권한 ${Date.now()}`, 'plainboard');
    expect((await setTask(adminCookie, id, { assigneeId: 'admin' }, 'plainboard')).status).toBe(
      400
    );
  });

  it('업무용을 끄면 이미 지정된 담당도 내 업무에서 빠진다', async () => {
    // 그 게시판에서는 상태를 바꿀 수도 없으므로, 남겨 두면 지울 수 없는 항목이 된다
    const id = await createPost(adminCookie, `용도변경 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'testuser', workStatus: 'todo' });

    const before = await request(app).get('/api/posts/tasks/mine').set('Cookie', userCookie);
    expect(before.body.data.map((t: { id: string }) => t.id)).toContain(id);

    await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
    try {
      const after = await request(app).get('/api/posts/tasks/mine').set('Cookie', userCookie);
      expect(after.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
    } finally {
      await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
    }
  });
});

describe('업무 상태', () => {
  it('기본은 상태 없음이다 — 모든 글이 할 일은 아니다', async () => {
    await createPost(adminCookie, `기본상태 ${Date.now()}`);
    const list = await request(app).get('/api/posts/notice').set('Cookie', adminCookie);
    expect(list.body.data.posts[0].workStatus).toBe('none');
  });

  it('상태를 바꾸면 목록에 바로 보인다', async () => {
    const id = await createPost(adminCookie, `상태변경 ${Date.now()}`);
    const res = await setTask(adminCookie, id, { workStatus: 'todo' });
    expect(res.status).toBe(200);
    expect(res.body.data.workStatus).toBe('todo');

    const list = await request(app).get('/api/posts/notice').set('Cookie', adminCookie);
    const hit = list.body.data.posts.find((p: { id: string }) => p.id === id);
    expect(hit.workStatus).toBe('todo');
  });

  it("'진행 중' 으로 바꾸면 담당자가 없을 때 바꾼 사람이 맡는다", async () => {
    // 담당자 없는 '진행 중' 은 앞뒤가 맞지 않는다
    const id = await createPost(adminCookie, `자동담당 ${Date.now()}`);
    const res = await setTask(adminCookie, id, { workStatus: 'doing' });
    expect(res.body.data.assignee.id).toBe('admin');
  });

  it("'할 일' 은 담당자를 강제하지 않는다 — 아직 누가 할지 모를 수 있다", async () => {
    const id = await createPost(adminCookie, `미정 ${Date.now()}`);
    const res = await setTask(adminCookie, id, { workStatus: 'todo' });
    expect(res.body.data.assignee).toBeNull();
  });

  it('알 수 없는 상태는 400', async () => {
    const id = await createPost(adminCookie, `잘못된상태 ${Date.now()}`);
    expect((await setTask(adminCookie, id, { workStatus: '진행중' })).status).toBe(400);
  });

  it('아무것도 안 바꾸는 요청은 400 — 성공으로 넘기지 않는다', async () => {
    const id = await createPost(adminCookie, `빈요청 ${Date.now()}`);
    expect((await setTask(adminCookie, id, {})).status).toBe(400);
  });
});

describe('담당자', () => {
  it('지정하면 그 사람에게 알림이 간다', async () => {
    const id = await createPost(adminCookie, `담당지정 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'testuser' });
    await new Promise(r => setTimeout(r, 250));

    const notes = await Notification.findAll({ where: { userId: 'testuser', type: 'ASSIGNMENT' } });
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('담당자');
  });

  it('스스로 맡을 때는 자기에게 알림을 보내지 않는다', async () => {
    const id = await createPost(adminCookie, `자가담당 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'admin' });
    await new Promise(r => setTimeout(r, 250));

    expect(await Notification.count({ where: { userId: 'admin', type: 'ASSIGNMENT' } })).toBe(0);
  });

  it('담당자 본인은 자기 상태를 바꿀 수 있다', async () => {
    // 못 바꾸면 결국 작성자에게 말해서 바꿔 달라고 해야 한다
    const id = await createPost(adminCookie, `본인변경 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'testuser' });

    const res = await setTask(userCookie, id, { workStatus: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.data.workStatus).toBe('done');
  });

  it('상관없는 사람은 바꿀 수 없다', async () => {
    const id = await createPost(adminCookie, `무관 ${Date.now()}`);
    expect((await setTask(thirdCookie, id, { workStatus: 'todo' })).status).toBe(403);
  });

  it('못 보는 게시판의 글에는 담당자로 지정할 수 없다', async () => {
    // 알림만 받고 열지 못하는 상태가 된다
    const id = await createPost(adminCookie, `권한밖담당 ${Date.now()}`, 'taskonly');
    const res = await setTask(adminCookie, id, { assigneeId: 'testuser' }, 'taskonly');
    expect(res.status).toBe(400);
  });

  it('없는 사용자는 담당자가 될 수 없다', async () => {
    const id = await createPost(adminCookie, `없는담당 ${Date.now()}`);
    expect((await setTask(adminCookie, id, { assigneeId: 'ghost' })).status).toBe(404);
  });

  it('null 로 담당자를 뗄 수 있다', async () => {
    const id = await createPost(adminCookie, `담당해제 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'testuser' });
    const res = await setTask(adminCookie, id, { assigneeId: null });
    expect(res.body.data.assignee).toBeNull();
  });
});

describe('목록 상태 필터', () => {
  it('상태로 목록을 좁힐 수 있다', async () => {
    const doing = await createPost(adminCookie, `필터진행 ${Date.now()}`);
    const plain = await createPost(adminCookie, `필터일반 ${Date.now()}`);
    await setTask(adminCookie, doing, { workStatus: 'doing' });

    const res = await request(app)
      .get('/api/posts/notice?workStatus=doing')
      .set('Cookie', adminCookie);
    const ids = res.body.data.posts.map((p: { id: string }) => p.id);
    expect(ids).toContain(doing);
    expect(ids).not.toContain(plain);
  });

  it('여러 상태를 함께 고를 수 있다 — "아직 안 끝난 것"', async () => {
    const todo = await createPost(adminCookie, `필터할일 ${Date.now()}`);
    const done = await createPost(adminCookie, `필터완료 ${Date.now()}`);
    await setTask(adminCookie, todo, { workStatus: 'todo' });
    await setTask(adminCookie, done, { workStatus: 'done' });

    const res = await request(app)
      .get('/api/posts/notice?workStatus=todo,doing')
      .set('Cookie', adminCookie);
    const ids = res.body.data.posts.map((p: { id: string }) => p.id);
    expect(ids).toContain(todo);
    expect(ids).not.toContain(done);
  });

  it('알 수 없는 상태값은 무시하고 전체를 준다 — 빈 목록으로 오해하게 두지 않는다', async () => {
    const id = await createPost(adminCookie, `필터오타 ${Date.now()}`);
    const res = await request(app)
      .get('/api/posts/notice?workStatus=진행중')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.posts.map((p: { id: string }) => p.id)).toContain(id);
  });
});

describe('상세 응답', () => {
  it('상태와 담당자가 글과 함께 온다 — 별도 요청이 필요하면 화면이 흔들린다', async () => {
    const id = await createPost(adminCookie, `상세담당 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'testuser', workStatus: 'doing' });

    const res = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    expect(res.body.data.workStatus).toBe('doing');
    expect(res.body.data.assignee).toMatchObject({ id: 'testuser' });
  });

  it('업무로 쓰지 않는 글은 상태 none, 담당자 null 이다', async () => {
    const id = await createPost(adminCookie, `상세기본 ${Date.now()}`);
    const res = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    expect(res.body.data.workStatus).toBe('none');
    expect(res.body.data.assignee).toBeNull();
  });
});

describe('담당자 후보 검색', () => {
  it('게시판을 지정하면 그 게시판을 볼 수 있는 사람만 준다', async () => {
    // 고를 수 없는 사람을 목록에 띄워 놓고 고른 뒤에 거절하면 고르는 사람만 헛수고한다
    const res = await request(app)
      .get('/api/users/search?q=test&boardType=taskonly')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { id: string }) => u.id)).not.toContain('testuser');
  });

  it('게시판을 지정하지 않으면 예전처럼 전부에서 찾는다', async () => {
    const res = await request(app).get('/api/users/search?q=testuser').set('Cookie', adminCookie);
    expect(res.body.data.map((u: { id: string }) => u.id)).toContain('testuser');
  });

  // 검색어 없이도 목록이 와야 한다. 빈 배열을 주면 화면에 '고를 수 있는 사람이 없습니다' 가
  // 떠서, 한 글자라도 쳐야 고를 수 있다고 오해하게 된다 — 클릭만으로 고르지 못한다.
  it('검색어가 없으면 이름순 첫 쪽을 준다', async () => {
    const res = await request(app).get('/api/users/search').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.length).toBeLessThanOrEqual(10);
    const names = res.body.data.map((u: { name: string }) => u.name);
    expect([...names].sort()).toEqual(names);
  });

  it('검색어가 없어도 게시판 조건은 그대로 건다', async () => {
    const res = await request(app)
      .get('/api/users/search?boardType=taskonly')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { id: string }) => u.id)).not.toContain('testuser');
  });

  it('볼 수 있는 게시판이면 후보에 남는다', async () => {
    const res = await request(app)
      .get('/api/users/search?q=testuser&boardType=notice')
      .set('Cookie', adminCookie);
    expect(res.body.data.map((u: { id: string }) => u.id)).toContain('testuser');
  });
});

describe('내 업무 모아 보기', () => {
  it('기본은 끝나지 않은 것만 준다', async () => {
    const doing = await createPost(adminCookie, `진행 ${Date.now()}`);
    const done = await createPost(adminCookie, `완료 ${Date.now()}`);
    await setTask(adminCookie, doing, { assigneeId: 'testuser', workStatus: 'todo' });
    await setTask(adminCookie, done, { assigneeId: 'testuser', workStatus: 'done' });

    const res = await request(app).get('/api/posts/tasks/mine').set('Cookie', userCookie);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(doing);
    expect(ids).not.toContain(done);
  });

  it('status 로 완료된 것도 볼 수 있다', async () => {
    const done = await createPost(adminCookie, `완료조회 ${Date.now()}`);
    await setTask(adminCookie, done, { assigneeId: 'testuser', workStatus: 'done' });

    const res = await request(app)
      .get('/api/posts/tasks/mine?status=done')
      .set('Cookie', userCookie);
    expect(res.body.data.map((t: { id: string }) => t.id)).toContain(done);
  });

  it('남이 담당인 글은 내 목록에 없다', async () => {
    const id = await createPost(adminCookie, `남의업무 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'admin', workStatus: 'todo' });

    const res = await request(app).get('/api/posts/tasks/mine').set('Cookie', userCookie);
    expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
  });
});

describe('일정', () => {
  it('시작일·마감일을 저장하면 내 업무 목록에 함께 온다 — 간트가 이 값으로 막대를 그린다', async () => {
    const id = await createPost(adminCookie, `일정 ${Date.now()}`);
    const res = await setTask(adminCookie, id, {
      assigneeId: 'testuser',
      workStatus: 'todo',
      startDate: '2026-10-01',
      dueDate: '2026-10-03',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ startDate: '2026-10-01', dueDate: '2026-10-03' });

    const list = await request(app).get('/api/posts/tasks/mine').set('Cookie', userCookie);
    const task = list.body.data.find((t: { id: string }) => t.id === id);
    expect(task).toMatchObject({ startDate: '2026-10-01', dueDate: '2026-10-03' });
  });

  it('일정만 바꾸는 요청도 받는다 — 막대를 끌 때 상태는 그대로다', async () => {
    const id = await createPost(adminCookie, `일정만 ${Date.now()}`);
    await setTask(adminCookie, id, { workStatus: 'doing' });
    const res = await setTask(adminCookie, id, { startDate: '2026-10-05', dueDate: '2026-10-05' });
    expect(res.status).toBe(200);
    expect(res.body.data.workStatus).toBe('doing');
  });

  it('null 로 일정을 지울 수 있다', async () => {
    const id = await createPost(adminCookie, `일정삭제 ${Date.now()}`);
    await setTask(adminCookie, id, { startDate: '2026-10-01', dueDate: '2026-10-02' });
    const res = await setTask(adminCookie, id, { startDate: null, dueDate: null });
    expect(res.body.data).toMatchObject({ startDate: null, dueDate: null });
  });

  it('형식이 틀리거나 없는 날짜는 400', async () => {
    const id = await createPost(adminCookie, `날짜형식 ${Date.now()}`);
    // 0002년: 날짜 칸에 연도를 치는 도중의 값이 저장되면 마감이 '8천 일 지남' 이 된다
    for (const bad of [
      '2026/10/01',
      '2026-02-30',
      '2026-13-01',
      20261001,
      '0002-10-16',
      '2101-01-01',
    ]) {
      const res = await setTask(adminCookie, id, { startDate: bad });
      expect(res.status).toBe(400);
    }
  });

  it('시작일이 마감일보다 늦으면 400 — 한쪽만 바꿔도 저장된 값과 맞춰 본다', async () => {
    const id = await createPost(adminCookie, `역순 ${Date.now()}`);
    await setTask(adminCookie, id, { startDate: '2026-10-01', dueDate: '2026-10-03' });
    const res = await setTask(adminCookie, id, { startDate: '2026-10-09' });
    expect(res.status).toBe(400);
  });

  it('상관없는 사람은 일정도 바꿀 수 없다', async () => {
    const id = await createPost(adminCookie, `남의일정 ${Date.now()}`);
    const res = await setTask(thirdCookie, id, { dueDate: '2026-10-03' });
    expect(res.status).toBe(403);
  });
});

describe('주소의 게시판과 글의 게시판', () => {
  it('다른 게시판 주소로는 바꿀 수 없다 — 라우터는 주소의 게시판 권한만 확인한다', async () => {
    const id = await createPost(adminCookie, `게시판대조 ${Date.now()}`);
    const res = await setTask(adminCookie, id, { workStatus: 'todo' }, 'plainboard');
    expect(res.status).toBe(404);
    const ok = await setTask(adminCookie, id, { workStatus: 'todo' });
    expect(ok.status).toBe(200);
  });
});

describe('되돌리기 충돌', () => {
  it('ifWorkStatus 가 지금 상태와 다르면 409 — 남이 바꾼 상태를 덮어쓰지 않는다', async () => {
    const id = await createPost(adminCookie, `되돌리기 ${Date.now()}`);
    await setTask(adminCookie, id, { workStatus: 'done' });
    // 그사이 다른 사람이 다시 진행 중으로 돌렸다
    await setTask(adminCookie, id, { workStatus: 'doing' });

    const undo = await setTask(adminCookie, id, { workStatus: 'todo', ifWorkStatus: 'done' });
    expect(undo.status).toBe(409);
    const detail = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    expect(detail.body.data.workStatus).toBe('doing');
  });

  it('상태가 그대로면 되돌린다', async () => {
    const id = await createPost(adminCookie, `되돌리기성공 ${Date.now()}`);
    await setTask(adminCookie, id, { workStatus: 'done' });
    const undo = await setTask(adminCookie, id, { workStatus: 'todo', ifWorkStatus: 'done' });
    expect(undo.status).toBe(200);
    expect(undo.body.data.workStatus).toBe('todo');
  });
});

describe('완료한 일과 끝나지 않은 일', () => {
  it('완료한 일이 아무리 쌓여도 끝나지 않은 일이 목록에서 밀려나지 않는다', async () => {
    // 오래된 순으로 한 번에 100건을 읽던 때는 완료 101건이 자리를 다 차지했다
    const done = await Post.bulkCreate(
      Array.from({ length: 101 }, (_, i) => ({
        title: `쌓인 완료 ${i}`,
        content: '<p>.</p>',
        author: 'admin',
        boardType: 'notice',
        UserId: 'admin',
        workStatus: 'done' as const,
        assigneeId: 'testuser',
      }))
    );
    try {
      const open = await createPost(adminCookie, `밀려나면 안 되는 일 ${Date.now()}`);
      await setTask(adminCookie, open, { assigneeId: 'testuser', workStatus: 'todo' });

      const res = await request(app)
        .get('/api/posts/tasks/mine?status=todo,doing,done')
        .set('Cookie', userCookie);
      const ids = res.body.data.map((t: { id: string }) => t.id);
      expect(ids).toContain(open);
      // 완료한 일은 최근 것만 일부 준다
      expect(
        res.body.data.filter((t: { workStatus: string }) => t.workStatus === 'done').length
      ).toBeLessThanOrEqual(50);
    } finally {
      await Post.destroy({ where: { id: done.map(p => p.id) }, force: true });
    }
  });
});

describe('팀 보기', () => {
  it('게시판을 읽을 수 있으면 남이 담당인 업무도 담당자와 함께 본다', async () => {
    const id = await createPost(adminCookie, `팀업무 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'admin', workStatus: 'doing' });

    const res = await request(app).get('/api/posts/tasks/board/notice').set('Cookie', thirdCookie);
    expect(res.status).toBe(200);
    const task = res.body.data.find((t: { id: string }) => t.id === id);
    expect(task.assignee).toMatchObject({ id: 'admin' });
  });

  it('바꿀 수 있는지(canEdit)를 서버의 권한 규칙대로 알려 준다', async () => {
    const id = await createPost(adminCookie, `권한표시 ${Date.now()}`);
    await setTask(adminCookie, id, { assigneeId: 'testuser', workStatus: 'todo' });

    const find = async (cookie: string) =>
      (
        await request(app).get('/api/posts/tasks/board/notice').set('Cookie', cookie)
      ).body.data.find((t: { id: string }) => t.id === id);
    expect((await find(userCookie)).canEdit).toBe(true); // 담당자
    expect((await find(adminCookie)).canEdit).toBe(true); // 작성자·관리자
    expect((await find(thirdCookie)).canEdit).toBe(false);
  });

  it("상태 없음('none') 글은 업무가 아니라 넣지 않는다", async () => {
    const id = await createPost(adminCookie, `일반글 ${Date.now()}`);
    const res = await request(app)
      .get('/api/posts/tasks/board/notice?status=none,todo,doing')
      .set('Cookie', adminCookie);
    expect(res.body.data.map((t: { id: string }) => t.id)).not.toContain(id);
  });

  it('업무용이 아닌 게시판은 400, 못 읽는 게시판은 막힌다', async () => {
    const plain = await request(app)
      .get('/api/posts/tasks/board/plainboard')
      .set('Cookie', adminCookie);
    expect(plain.status).toBe(400);
    const hidden = await request(app)
      .get('/api/posts/tasks/board/taskonly')
      .set('Cookie', userCookie);
    expect(hidden.status).toBe(403);
  });

  it('고를 수 있는 게시판은 업무용이면서 읽을 수 있는 것뿐이다', async () => {
    const res = await request(app).get('/api/posts/tasks/boards').set('Cookie', userCookie);
    const ids = res.body.data.map((b: { id: string }) => b.id);
    expect(ids).toContain('notice');
    expect(ids).not.toContain('plainboard');
    expect(ids).not.toContain('taskonly');
  });
});

describe('마감 알림', () => {
  const now = new Date(2026, 9, 11, 10, 0);

  /** 관리자 설정만 바꾼다. 되돌리는 것은 각 검사가 맡는다. */
  const setTaskRules = async (patch: Record<string, number>) => {
    const [row] = await SiteSettings.findOrCreate({ where: {} });
    await row.update(patch);
    await refreshSettingsCache();
  };
  const resetTaskRules = () =>
    setTaskRules({ taskReminderDaysBefore: 1, taskReminderHour: 9, taskSoonDays: 3 });

  it('마감이 오늘·내일인 담당자에게 하루 한 번만 알린다', async () => {
    const today = await createPost(adminCookie, `오늘마감 ${Date.now()}`);
    const tomorrow = await createPost(adminCookie, `내일마감 ${Date.now()}`);
    const later = await createPost(adminCookie, `나중마감 ${Date.now()}`);
    await setTask(adminCookie, today, {
      assigneeId: 'testuser',
      workStatus: 'todo',
      dueDate: '2026-10-11',
    });
    await setTask(adminCookie, tomorrow, {
      assigneeId: 'testuser',
      workStatus: 'doing',
      dueDate: '2026-10-12',
    });
    await setTask(adminCookie, later, {
      assigneeId: 'testuser',
      workStatus: 'todo',
      dueDate: '2026-10-20',
    });
    // 담당자 지정 알림은 이 검사와 상관없다
    await Notification.destroy({ where: {} });

    await sendDueReminders(now);
    const sent = await Notification.findAll({ where: { type: 'TASK_DUE', userId: 'testuser' } });
    expect(sent.map(n => n.relatedId).sort()).toEqual([today, tomorrow].sort());
    expect(sent.find(n => n.relatedId === today)?.message).toContain('오늘');

    // 한 시간 뒤에 다시 돌아도 더 보내지 않는다
    await sendDueReminders(new Date(2026, 9, 11, 11, 0));
    expect(await Notification.count({ where: { type: 'TASK_DUE' } })).toBe(2);
  });

  it('지정 뒤에 볼 수 없게 된 글은 알리지 않는다 — 알림에 제목이 실린다', async () => {
    // 못 읽는 게시판의 글. API 로는 지정이 막히므로 예전에 지정된 상태를 DB 로 만든다.
    const hidden = await Post.create({
      title: `못보는게시판 ${Date.now()}`,
      content: '<p>.</p>',
      author: 'admin',
      boardType: 'taskonly',
      UserId: 'admin',
      workStatus: 'todo',
      assigneeId: 'testuser',
      dueDate: '2026-10-11',
    });
    // 비밀글이 되면서 명단에서 빠진 글
    const secret = await createPost(adminCookie, `비밀이됨 ${Date.now()}`);
    await setTask(adminCookie, secret, {
      assigneeId: 'testuser',
      workStatus: 'todo',
      dueDate: '2026-10-11',
    });
    await Post.update(
      { isSecret: true, secretType: 'users', secretUserIds: ['admin'] },
      { where: { id: secret } }
    );
    await Notification.destroy({ where: {} });

    try {
      await sendDueReminders(now);
      // 앞 검사에서 만든 '오늘 마감' 글은 여전히 알림 대상이라 이 두 글만 센다
      expect(
        await Notification.count({ where: { type: 'TASK_DUE', relatedId: [hidden.id, secret] } })
      ).toBe(0);
    } finally {
      await Post.destroy({ where: { id: [hidden.id, secret] }, force: true });
    }
  });

  it('정지된 계정에는 알리지 않는다', async () => {
    const id = await createPost(adminCookie, `정지계정 ${Date.now()}`);
    await setTask(adminCookie, id, {
      assigneeId: 'thirduser',
      workStatus: 'todo',
      dueDate: '2026-10-11',
    });
    await Notification.destroy({ where: {} });
    await User.update({ isActive: false }, { where: { id: 'thirduser' } });
    try {
      await sendDueReminders(now);
      expect(await Notification.count({ where: { type: 'TASK_DUE', relatedId: id } })).toBe(0);
    } finally {
      await User.update({ isActive: true }, { where: { id: 'thirduser' } });
    }
  });

  it('끝낸 일은 알리지 않는다', async () => {
    const id = await createPost(adminCookie, `끝낸마감 ${Date.now()}`);
    await setTask(adminCookie, id, {
      assigneeId: 'testuser',
      workStatus: 'done',
      dueDate: '2026-10-11',
    });
    await sendDueReminders(now);
    expect(await Notification.count({ where: { type: 'TASK_DUE', relatedId: id } })).toBe(0);
  });

  it('정해 둔 시각 전에는 보내지 않는다 — 자정 직후에 울리지 않게', async () => {
    const id = await createPost(adminCookie, `새벽 ${Date.now()}`);
    await setTask(adminCookie, id, {
      assigneeId: 'testuser',
      workStatus: 'todo',
      dueDate: '2026-10-11',
    });
    await Notification.destroy({ where: {} });
    await setTaskRules({ taskReminderHour: 9 });
    const mine = () => Notification.count({ where: { type: 'TASK_DUE', relatedId: id } });

    // 주기는 1시간이라 자정 직후에도 한 번 돈다. 그때는 아무것도 보내지 않아야 한다.
    expect(await sendDueReminders(new Date(2026, 9, 11, 0, 5))).toBe(0);
    expect(await mine()).toBe(0);

    // 그 시각이 되면 보낸다
    await sendDueReminders(new Date(2026, 9, 11, 9, 0));
    expect(await mine()).toBe(1);
    await resetTaskRules();
  });

  it('며칠 전부터 알릴지는 관리자가 정한다 — 0 이면 마감 당일만', async () => {
    const today = await createPost(adminCookie, `당일 ${Date.now()}`);
    const tomorrow = await createPost(adminCookie, `다음날 ${Date.now()}`);
    for (const [id, due] of [
      [today, '2026-10-11'],
      [tomorrow, '2026-10-12'],
    ] as const) {
      await setTask(adminCookie, id, { assigneeId: 'testuser', workStatus: 'todo', dueDate: due });
    }
    await Notification.destroy({ where: {} });
    await setTaskRules({ taskReminderDaysBefore: 0 });

    await sendDueReminders(now);
    // 앞 검사가 만든 글도 함께 걸리므로 이 검사가 만든 둘만 본다
    const count = (id: string) =>
      Notification.count({ where: { type: 'TASK_DUE', relatedId: id } });
    expect(await count(today)).toBe(1);
    expect(await count(tomorrow)).toBe(0);
    await resetTaskRules();
  });

  it('사흘 전부터로 넓히면 그만큼 알리고 문구도 날 수에 맞춘다', async () => {
    const third = await createPost(adminCookie, `사흘뒤 ${Date.now()}`);
    await setTask(adminCookie, third, {
      assigneeId: 'testuser',
      workStatus: 'todo',
      dueDate: '2026-10-14',
    });
    await Notification.destroy({ where: {} });
    await setTaskRules({ taskReminderDaysBefore: 3 });

    await sendDueReminders(now);
    const sent = await Notification.findOne({
      where: { type: 'TASK_DUE', relatedId: third },
    });
    expect(sent?.message).toContain('3일 뒤');
    await resetTaskRules();
  });
});

describe('읽음 확인', () => {
  it('작성자는 누가 읽었는지 볼 수 있다', async () => {
    const id = await createPost(adminCookie, `읽음확인 ${Date.now()}`);
    await request(app)
      .post(`/api/posts/notice/${id}/read`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);

    const res = await readers(adminCookie, id);
    expect(res.status).toBe(200);
    expect(res.body.data.readCount).toBe(1);
    expect(res.body.data.readers[0].id).toBe('testuser');
  });

  it('작성자 본인은 대상 인원에서 뺀다 — 자기 글을 읽은 것은 확인이 아니다', async () => {
    const id = await createPost(adminCookie, `본인제외 ${Date.now()}`);
    await request(app)
      .post(`/api/posts/notice/${id}/read`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);

    const res = await readers(adminCookie, id);
    expect(res.body.data.readers.map((r: { id: string }) => r.id)).not.toContain('admin');
    expect(res.body.data.unread.map((u: { id: string }) => u.id)).not.toContain('admin');
  });

  it('아직 안 읽은 사람도 함께 알려 준다', async () => {
    const id = await createPost(adminCookie, `미확인 ${Date.now()}`);
    const res = await readers(adminCookie, id);

    expect(res.body.data.readCount).toBe(0);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.unread.length).toBe(res.body.data.total);
  });

  it('상관없는 사람은 볼 수 없다 — 확인용이지 감시용이 아니다', async () => {
    const id = await createPost(adminCookie, `감시방지 ${Date.now()}`);
    expect((await readers(thirdCookie, id)).status).toBe(403);
  });

  it('없는 글은 404', async () => {
    expect((await readers(adminCookie, 'nosuchpost1')).status).toBe(404);
  });
});

describe('비밀글 담당자 — 명단에 없는 사람에게 제목이 새지 않는다', () => {
  // 게시판 권한만 보던 때는, 명단에서 빠진 사람도 담당자로 지정할 수 있었다. 그 사람은 알림으로
  // 제목을 읽고("…님이 \"<비밀글 제목>\" 의 담당자로 지정했습니다"), '내 업무' 목록에도 제목이
  // 남았다. 정작 글은 403 이라 열지 못하면서 상태·담당자는 바꿀 수 있었다(담당자라서).
  const secretPost = async (allowed: string[]) => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '비밀 제목입니다',
        content: '<p>비밀</p>',
        isSecret: true,
        secretType: 'users',
        secretUserIds: allowed,
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };

  it('명단에 없는 사람은 담당자로 지정할 수 없다', async () => {
    const id = await secretPost(['admin']);

    const res = await setTask(adminCookie, id, { assigneeId: 'testuser' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/비밀글/);
  });

  it('지정이 막히면 알림도 가지 않는다', async () => {
    const id = await secretPost(['admin']);
    await Notification.destroy({ where: { userId: 'testuser' } });

    await setTask(adminCookie, id, { assigneeId: 'testuser' });

    const rows = await Notification.findAll({ where: { userId: 'testuser' } });
    expect(rows.map(r => r.message).join(' ')).not.toContain('비밀 제목입니다');
  });

  it('명단에 있는 사람은 그대로 지정된다 — 대조', async () => {
    const id = await secretPost(['admin', 'testuser']);

    const res = await setTask(adminCookie, id, { assigneeId: 'testuser' });

    expect(res.status).toBe(200);
    expect(res.body.data.assignee?.id).toBe('testuser');
  });

  it('지정된 뒤 명단에서 빠지면 내 업무 목록에서도 사라진다', async () => {
    const id = await secretPost(['admin', 'testuser']);
    expect(
      (await setTask(adminCookie, id, { assigneeId: 'testuser', workStatus: 'todo' })).status
    ).toBe(200);

    const before = await request(app).get('/api/posts/tasks/mine').set('Cookie', userCookie);
    expect(JSON.stringify(before.body.data)).toContain('비밀 제목입니다');

    // 작성자가 명단에서 뺀다
    await request(app)
      .put(`/api/posts/notice/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '비밀 제목입니다',
        content: '<p>비밀</p>',
        isSecret: true,
        secretType: 'users',
        secretUserIds: ['admin'],
      });

    const after = await request(app).get('/api/posts/tasks/mine').set('Cookie', userCookie);
    expect(after.status).toBe(200);
    expect(JSON.stringify(after.body.data)).not.toContain('비밀 제목입니다');
  });
});
