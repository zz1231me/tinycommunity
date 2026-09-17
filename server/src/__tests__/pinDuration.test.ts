import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Post } from '../models/Post';
import { postService, resetPinSweepThrottle } from '../services/post.service';

// 상단 고정 기간 — 기간이 지난 공지가 계속 위에 붙어 있으면
// 목록 맨 위가 지난 공지 창고가 된다. 만료가 실제로 풀리는지를 고정한다.

let adminCookie: string;
let userCookie: string;

async function createPost(title: string): Promise<string> {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function pin(id: string, body: Record<string, unknown> = {}, cookie = adminCookie) {
  return request(app)
    .patch(`/api/posts/notice/${id}/pin`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body);
}

function listNotice() {
  return request(app).get('/api/posts/notice').set('Cookie', adminCookie);
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('기간 없는 고정', () => {
  it('기간을 주지 않으면 무기한 고정이다', async () => {
    const id = await createPost(`무기한 ${Date.now()}`);

    const res = await pin(id);
    expect(res.status).toBe(200);
    expect(res.body.data.isPinned).toBe(true);
    expect(res.body.data.pinnedUntil).toBeNull();
  });

  it('다시 누르면 고정이 풀린다', async () => {
    const id = await createPost(`토글 ${Date.now()}`);
    await pin(id);

    const res = await pin(id);
    expect(res.body.data.isPinned).toBe(false);
  });
});

describe('기간 있는 고정', () => {
  it('만료 시각을 함께 저장한다', async () => {
    const id = await createPost(`기간고정 ${Date.now()}`);
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const res = await pin(id, { pinnedUntil: until.toISOString() });
    expect(res.body.data.isPinned).toBe(true);
    expect(new Date(res.body.data.pinnedUntil).getTime()).toBe(until.getTime());
  });

  it('목록 응답에 만료 시각이 실려 온다', async () => {
    const id = await createPost(`목록표시 ${Date.now()}`);
    const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await pin(id, { pinnedUntil: until.toISOString() });

    const list = await listNotice();
    const hit = list.body.data.posts.find((p: { id: string }) => p.id === id);
    expect(hit.isPinned).toBe(true);
    expect(hit.pinnedUntil).not.toBeNull();
  });

  it('기간이 지나면 목록 조회 시 고정이 풀린다', async () => {
    const id = await createPost(`만료대상 ${Date.now()}`);
    await pin(id, { pinnedUntil: new Date(Date.now() + 60_000).toISOString() });

    // 만료 시각을 과거로 돌려 "시간이 지난" 상태를 만든다
    await Post.update(
      { pinnedUntil: new Date(Date.now() - 1000) },
      { where: { id }, silent: true }
    );

    // 스윕에는 주기가 있다(목록 조회마다 UPDATE 를 내보내지 않기 위해).
    // 방금 다른 요청이 쓸고 갔을 수 있으므로 주기를 풀고 확인한다.
    resetPinSweepThrottle();

    const list = await listNotice();
    const hit = list.body.data.posts.find((p: { id: string }) => p.id === id);
    expect(hit.isPinned).toBe(false);
    expect(hit.pinnedUntil).toBeNull();
  });

  it('스윕은 주기 안에 여러 번 불러도 한 번만 돈다', async () => {
    // 목록 조회는 잦다 — 매번 UPDATE 를 내보내면 읽기 요청마다 쓰기 잠금이 생긴다
    const id = await createPost(`주기확인 ${Date.now()}`);
    await pin(id, { pinnedUntil: new Date(Date.now() + 60_000).toISOString() });
    await Post.update(
      { pinnedUntil: new Date(Date.now() - 1000) },
      { where: { id }, silent: true }
    );

    resetPinSweepThrottle();
    await postService.expirePins(); // 여기서 실제로 쓸린다
    await Post.update({ isPinned: true }, { where: { id }, silent: true });
    await postService.expirePins(); // 주기 안이라 아무 일도 하지 않는다

    const stillPinned = await Post.findByPk(id);
    expect(stillPinned?.isPinned).toBe(true);
  });

  it('고정을 풀면 기간도 함께 지워진다', async () => {
    const id = await createPost(`기간정리 ${Date.now()}`);
    await pin(id, { pinnedUntil: new Date(Date.now() + 86_400_000).toISOString() });

    const off = await pin(id);
    expect(off.body.data.isPinned).toBe(false);
    expect(off.body.data.pinnedUntil).toBeNull();
  });

  it('지난 시각으로는 고정할 수 없다', async () => {
    const id = await createPost(`과거고정 ${Date.now()}`);

    const res = await pin(id, { pinnedUntil: new Date(Date.now() - 1000).toISOString() });
    expect(res.status).toBe(400);
  });

  it('날짜가 아닌 값은 400', async () => {
    const id = await createPost(`잘못된값 ${Date.now()}`);
    expect((await pin(id, { pinnedUntil: '내일쯤' })).status).toBe(400);
  });
});

describe('고정 권한', () => {
  it('담당자가 아닌 일반 사용자는 고정할 수 없다', async () => {
    const id = await createPost(`권한 ${Date.now()}`);
    expect((await pin(id, {}, userCookie)).status).toBe(403);
  });
});

describe('만료 시각은 목록과 상세가 같아야 한다', () => {
  // 목록에만 pinnedUntil 이 실리면, 기간을 정해 고정해도 글을 열었을 때
  // '고정 해제' 로만 보이고 남은 기간을 알 수 없다.
  it('기간을 정해 고정하면 상세 응답에도 만료 시각이 실린다', async () => {
    const id = await createPost(`상세만료 ${Date.now()}`);
    const until = new Date(Date.now() + 7 * 86400000).toISOString();
    expect((await pin(id, { pinnedUntil: until })).status).toBe(200);

    const detail = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.isPinned).toBe(true);
    expect(detail.body.data.pinnedUntil).toBeTruthy();

    const list = await listNotice();
    const row = list.body.data.posts.find((p: { id: string }) => p.id === id);
    expect(new Date(detail.body.data.pinnedUntil).toISOString()).toBe(
      new Date(row.pinnedUntil).toISOString()
    );
  });

  it('기간 없이 고정하면 두 응답 모두 null 이다', async () => {
    const id = await createPost(`상세무기한 ${Date.now()}`);
    expect((await pin(id)).status).toBe(200);

    const detail = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    expect(detail.body.data.isPinned).toBe(true);
    expect(detail.body.data.pinnedUntil).toBeNull();

    const list = await listNotice();
    const row = list.body.data.posts.find((p: { id: string }) => p.id === id);
    expect(row.pinnedUntil).toBeNull();
  });
});
