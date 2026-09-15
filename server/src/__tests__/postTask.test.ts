import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { Notification } from '../models/Notification';
import { PostRead } from '../models/PostRead';
import { SiteSettings } from '../models/SiteSettings';
import { refreshSettingsCache } from '../utils/settingsCache';

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
