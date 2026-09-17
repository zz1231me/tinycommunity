import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import { Post } from '../models/Post';
import { PostActivity } from '../models/PostActivity';

// 글 활동 기록.
//
// 수정 이력·첨부 버전·상태 변경 세 곳에 나뉘어 쌓인 기록을 시간순으로 합친다.
//
// 지켜야 하는 선:
//  1. 바뀐 것만 적는다.
//  2. 글을 볼 수 있으면 기록도 볼 수 있고, 못 보면 못 본다.
//  3. 한 번 적은 줄은 바뀌지 않는다.

let adminCookie: string;
let userCookie: string;

interface Entry {
  id: string;
  kind: string;
  at: string;
  actor: { id: string; name: string } | null;
  from?: { value: string | null; label: string | null };
  to?: { value: string | null; label: string | null };
}

async function createPost(title: string, board = 'notice'): Promise<string> {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function setTask(id: string, body: Record<string, unknown>) {
  return request(app)
    .patch(`/api/posts/notice/${id}/task`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send(body);
}

async function activity(cookie: string, id: string, board = 'notice') {
  return request(app).get(`/api/posts/${board}/${id}/activity`).set('Cookie', cookie);
}

beforeAll(async () => {
  await seedTestData();
  await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

afterAll(async () => {
  await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
});

describe('기록되는 것', () => {
  it('갓 쓴 글에는 작성 한 줄만 있다', async () => {
    const id = await createPost(`작성만 ${Date.now()}`);
    const res = await activity(adminCookie, id);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ kind: 'created', actor: { id: 'admin' } });
  });

  it('상태를 바꾸면 이전 값과 새 값이 함께 남는다', async () => {
    const id = await createPost(`상태기록 ${Date.now()}`);
    await setTask(id, { workStatus: 'todo' });

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    const status = entries.find(e => e.kind === 'status');
    expect(status?.from?.value).toBe('none');
    expect(status?.to?.value).toBe('todo');
    expect(status?.actor?.id).toBe('admin');
  });

  it('담당자 변경은 아이디가 아니라 이름으로 읽힌다', async () => {
    // 기록을 읽는 사람은 'testuser' 가 누구인지 모른다
    const id = await createPost(`담당기록 ${Date.now()}`);
    await setTask(id, { assigneeId: 'testuser' });

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    const change = entries.find(e => e.kind === 'assignee');
    expect(change?.to?.value).toBe('testuser');
    expect(change?.to?.label).toBe('테스트사용자');
    expect(change?.from?.value).toBeNull();
  });

  it("'진행 중' 으로 바꿔 담당자가 자동으로 붙으면 두 줄이 남는다", async () => {
    // 상태만 바꿨는데 담당자도 달라졌다면, 그 사실도 기록에 보여야 한다
    const id = await createPost(`자동담당기록 ${Date.now()}`);
    await setTask(id, { workStatus: 'doing' });

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    expect(entries.filter(e => e.kind === 'status')).toHaveLength(1);
    expect(entries.filter(e => e.kind === 'assignee')).toHaveLength(1);
  });

  it('본문을 고치면 수정 줄이 생기고, diff 를 열 수 있는 번호가 붙는다', async () => {
    const id = await createPost(`본문수정 ${Date.now()}`);
    await request(app)
      .put(`/api/posts/notice/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: '고친 제목', content: '<p>고친 본문</p>' });

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    const edited = entries.find(e => e.kind === 'edited') as Entry & { revisionId?: number };
    expect(edited).toBeDefined();
    expect(typeof edited.revisionId).toBe('number');
  });
});

describe('기록되지 않는 것', () => {
  it('같은 값으로 다시 저장하면 줄이 늘지 않는다', async () => {
    const id = await createPost(`같은값 ${Date.now()}`);
    await setTask(id, { workStatus: 'todo' });
    const before = (await activity(adminCookie, id)).body.data.length;

    await setTask(id, { workStatus: 'todo' });

    expect((await activity(adminCookie, id)).body.data.length).toBe(before);
  });

  it('담당자를 그대로 둔 채 상태만 바꾸면 담당자 줄은 안 생긴다', async () => {
    const id = await createPost(`담당유지 ${Date.now()}`);
    await setTask(id, { assigneeId: 'testuser' });
    await setTask(id, { workStatus: 'todo' });

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    expect(entries.filter(e => e.kind === 'assignee')).toHaveLength(1);
  });
});

describe('순서와 접근', () => {
  it('최신이 위, 작성이 맨 아래다', async () => {
    const id = await createPost(`순서 ${Date.now()}`);
    await setTask(id, { workStatus: 'todo' });
    await setTask(id, { workStatus: 'done' });

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    expect(entries[entries.length - 1].kind).toBe('created');
    for (let i = 1; i < entries.length; i++) {
      expect(new Date(entries[i - 1].at).getTime()).toBeGreaterThanOrEqual(
        new Date(entries[i].at).getTime()
      );
    }
  });

  it('같은 시각에 적혀도 작성이 맨 아래다', async () => {
    // 글을 쓰자마자 상태를 바꾸면 두 줄의 시각이 같은 밀리초일 수 있다.
    // 그때 '작성' 이 위로 올라오면 "쓰기도 전에 바꿨다" 처럼 읽힌다.
    const id = await createPost(`동시각 ${Date.now()}`);
    await Post.update({ createdAt: new Date() }, { where: { id }, silent: true });
    const created = (await Post.findByPk(id))?.createdAt as Date;
    await setTask(id, { workStatus: 'todo' });
    await PostActivity.update({ createdAt: created }, { where: { postId: id } });

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    expect(entries).toHaveLength(2);
    expect(entries[entries.length - 1].kind).toBe('created');
  });

  it('글을 볼 수 있으면 기록도 볼 수 있다', async () => {
    const id = await createPost(`열람 ${Date.now()}`);
    expect((await activity(userCookie, id)).status).toBe(200);
  });

  it('아무리 오래된 글이어도 한 번에 보내는 줄 수에는 한계가 있다', async () => {
    // 수정만 수십 번인 글이 있다. 화면이 읽지도 않을 양을 매번 실어 보내지 않는다.
    const id = await createPost(`많은기록 ${Date.now()}`);
    for (let i = 0; i < 30; i++) {
      await setTask(id, { workStatus: i % 2 === 0 ? 'todo' : 'doing' });
    }

    const entries: Entry[] = (await activity(adminCookie, id)).body.data;
    expect(entries.length).toBeLessThanOrEqual(50);
    // 잘리더라도 '작성' 은 남아야 한다 — 글이 언제 시작됐는지가 기록의 기준점이다
    expect(entries[entries.length - 1].kind).toBe('created');
  });

  it('비밀글은 잠금 해제 전에는 기록도 못 본다 — 얕게 읽어도 규칙은 같다', async () => {
    // 판정에 필요한 것만 읽도록 바꿨다(본문·조인 제외). 규칙이 함께 얕아지면
    // 이력이 본문보다 느슨하게 열리는 사고가 된다.
    const secret = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: `비밀 ${Date.now()}`,
        content: '<p>비밀</p>',
        isSecret: true,
        secretType: 'password',
        secretPassword: 'pw12345',
      });
    expect(secret.status).toBe(201);

    // 작성자가 아닌 사람은 기록도 못 본다
    expect((await activity(userCookie, secret.body.data.id)).status).toBe(403);
  });

  it('없는 글은 404', async () => {
    expect((await activity(adminCookie, 'nosuchpost1')).status).toBe(404);
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/posts/notice/whatever/activity')).status).toBe(401);
  });
});
