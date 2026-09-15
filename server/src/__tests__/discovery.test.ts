import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';

// 탐색(인기글·관련 글·태그 클라우드)과 참여(스크랩).
// 셋 다 "읽을 수 있는 게시판만" 이라는 전제 위에 있으므로, 기능 동작만큼이나
// 못 읽는 글이 새지 않는지를 함께 고정한다.

let adminCookie: string;
let userCookie: string;

async function createPost(cookie: string, title: string, board = 'notice'): Promise<string> {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function like(cookie: string, id: string, board = 'notice') {
  return request(app).post(`/api/posts/${board}/${id}/like`).set(CSRF_HEADER).set('Cookie', cookie);
}

function scrap(cookie: string, id: string, board = 'notice') {
  return request(app)
    .post(`/api/posts/${board}/${id}/scrap`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie);
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다

  // admin 만 읽을 수 있는 게시판 — 권한 경계를 확인하기 위한 것
  await Board.findOrCreate({
    where: { id: 'adminonly' },
    defaults: {
      id: 'adminonly',
      name: '관리자 전용',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      order: 2,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: 'adminonly', roleId: 'admin' },
    defaults: {
      boardId: 'adminonly',
      roleId: 'admin',
      canRead: true,
      canWrite: true,
      canDelete: true,
    },
  });

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('인기글', () => {
  it('반응이 없는 글은 인기글에 넣지 않는다', async () => {
    const id = await createPost(adminCookie, `무반응 ${Date.now()}`);

    const res = await request(app).get('/api/posts/popular').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.posts.map((p: { id: string }) => p.id)).not.toContain(id);
  });

  it('좋아요를 받은 글은 인기글에 오른다', async () => {
    const id = await createPost(adminCookie, `인기글 ${Date.now()}`);
    await like(adminCookie, id);

    const res = await request(app).get('/api/posts/popular').set('Cookie', adminCookie);
    expect(res.body.data.posts.map((p: { id: string }) => p.id)).toContain(id);
  });

  it('좋아요가 많은 글이 위로 온다', async () => {
    const weak = await createPost(adminCookie, `약함 ${Date.now()}`);
    const strong = await createPost(adminCookie, `강함 ${Date.now()}`);
    await like(adminCookie, weak);
    await like(adminCookie, strong);
    await like(userCookie, strong);

    // limit 을 넉넉히 준다. 기본값(10)으로 물으면 이 스위트가 앞서 만든 글들에 밀려
    // 좋아요 1개짜리가 목록 밖으로 나가고, 그때 indexOf 가 -1 이 되어 비교가
    // "순서가 틀렸다" 처럼 실패한다 — 실제로는 순서가 아니라 표본이 잘린 것이다.
    const res = await request(app).get('/api/posts/popular?limit=30').set('Cookie', adminCookie);
    const ids: string[] = res.body.data.posts.map((p: { id: string }) => p.id);
    expect(ids).toContain(strong);
    expect(ids).toContain(weak);
    expect(ids.indexOf(strong)).toBeLessThan(ids.indexOf(weak));
  });

  it('읽을 수 없는 게시판의 글은 인기글에도 나오지 않는다', async () => {
    const hidden = await createPost(adminCookie, `숨김 ${Date.now()}`, 'adminonly');
    await like(adminCookie, hidden, 'adminonly');

    const res = await request(app).get('/api/posts/popular').set('Cookie', userCookie);
    expect(res.body.data.posts.map((p: { id: string }) => p.id)).not.toContain(hidden);
  });

  it('알 수 없는 period 는 기본값(week)으로 처리한다', async () => {
    const res = await request(app)
      .get('/api/posts/popular?period=nonsense')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe('week');
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/posts/popular')).status).toBe(401);
  });
});

describe('관련 글', () => {
  it('자기 자신은 관련 글에 넣지 않는다', async () => {
    const id = await createPost(adminCookie, `본문 ${Date.now()}`);

    const res = await request(app)
      .get(`/api/posts/notice/${id}/related`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id)).not.toContain(id);
  });

  it('태그가 없으면 같은 게시판의 다른 글로 채운다', async () => {
    const other = await createPost(adminCookie, `이웃 ${Date.now()}`);
    const id = await createPost(adminCookie, `기준 ${Date.now()}`);

    const res = await request(app)
      .get(`/api/posts/notice/${id}/related`)
      .set('Cookie', adminCookie);
    expect(res.body.data.map((p: { id: string }) => p.id)).toContain(other);
  });

  it('읽을 수 없는 게시판의 글에는 접근 자체가 막힌다', async () => {
    const hidden = await createPost(adminCookie, `비공개 ${Date.now()}`, 'adminonly');

    const res = await request(app)
      .get(`/api/posts/adminonly/${hidden}/related`)
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });
});

describe('태그 클라우드', () => {
  it('글이 붙지 않은 태그는 빠진다', async () => {
    const created = await request(app)
      .post('/api/tags')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: `빈태그${Date.now()}`, color: '#3b82f6' });
    expect(created.status).toBe(201);

    const res = await request(app).get('/api/tags/cloud').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { id: number }) => t.id)).not.toContain(created.body.data.id);
  });

  it('글이 붙은 태그는 개수와 함께 나온다', async () => {
    const tag = await request(app)
      .post('/api/tags')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: `쓰는태그${Date.now()}`, color: '#3b82f6' });
    const postId = await createPost(adminCookie, `태그글 ${Date.now()}`);
    await request(app)
      .post(`/api/posts/notice/${postId}/tags`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ tagIds: [tag.body.data.id] });

    const res = await request(app).get('/api/tags/cloud').set('Cookie', adminCookie);
    const hit = res.body.data.find((t: { id: number }) => t.id === tag.body.data.id);
    expect(hit).toBeDefined();
    expect(hit.postCount).toBe(1);
  });

  it('읽을 수 없는 게시판의 글은 태그 개수에 세지 않는다', async () => {
    const tag = await request(app)
      .post('/api/tags')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: `숨은태그${Date.now()}`, color: '#3b82f6' });
    const hidden = await createPost(adminCookie, `숨은글 ${Date.now()}`, 'adminonly');
    await request(app)
      .post(`/api/posts/adminonly/${hidden}/tags`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ tagIds: [tag.body.data.id] });

    const res = await request(app).get('/api/tags/cloud').set('Cookie', userCookie);
    expect(res.body.data.map((t: { id: number }) => t.id)).not.toContain(tag.body.data.id);
  });
});

describe('태그별 글', () => {
  it('그 태그가 붙은 글만 돌려준다', async () => {
    const tag = await request(app)
      .post('/api/tags')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: `조회태그${Date.now()}`, color: '#3b82f6' });
    const tagged = await createPost(adminCookie, `태그있음 ${Date.now()}`);
    const untagged = await createPost(adminCookie, `태그없음 ${Date.now()}`);
    await request(app)
      .post(`/api/posts/notice/${tagged}/tags`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ tagIds: [tag.body.data.id] });

    const res = await request(app)
      .get(`/api/tags/${tag.body.data.id}/posts`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const ids = res.body.data.posts.map((p: { id: string }) => p.id);
    expect(ids).toContain(tagged);
    expect(ids).not.toContain(untagged);
  });

  it('읽을 수 없는 게시판의 글은 태그로도 새지 않는다', async () => {
    const tag = await request(app)
      .post('/api/tags')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: `샘방지${Date.now()}`, color: '#3b82f6' });
    const hidden = await createPost(adminCookie, `숨김태그글 ${Date.now()}`, 'adminonly');
    await request(app)
      .post(`/api/posts/adminonly/${hidden}/tags`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ tagIds: [tag.body.data.id] });

    const res = await request(app)
      .get(`/api/tags/${tag.body.data.id}/posts`)
      .set('Cookie', userCookie);
    expect(res.body.data.posts.map((p: { id: string }) => p.id)).not.toContain(hidden);
  });

  it('숫자가 아닌 태그 id 는 400', async () => {
    const res = await request(app).get('/api/tags/abc/posts').set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });
});

describe('스크랩', () => {
  it('토글하면 켜지고, 다시 토글하면 꺼진다', async () => {
    const id = await createPost(adminCookie, `스크랩 ${Date.now()}`);

    expect((await scrap(userCookie, id)).body.data.scrapped).toBe(true);
    expect((await scrap(userCookie, id)).body.data.scrapped).toBe(false);
  });

  it('상태 조회가 토글 결과와 일치한다', async () => {
    const id = await createPost(adminCookie, `상태 ${Date.now()}`);
    await scrap(userCookie, id);

    const res = await request(app).get(`/api/posts/notice/${id}/scrap`).set('Cookie', userCookie);
    expect(res.body.data.scrapped).toBe(true);
  });

  it('내 목록에는 내가 스크랩한 글만 담긴다', async () => {
    const mine = await createPost(adminCookie, `내스크랩 ${Date.now()}`);
    const notMine = await createPost(adminCookie, `남스크랩 ${Date.now()}`);
    await scrap(userCookie, mine);
    await scrap(adminCookie, notMine);

    const res = await request(app).get('/api/posts/scraps/mine').set('Cookie', userCookie);
    expect(res.status).toBe(200);
    const ids = res.body.data.posts.map((p: { id: string }) => p.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(notMine);
  });

  it('없는 글은 스크랩할 수 없다', async () => {
    const res = await scrap(userCookie, 'nonexistent1');
    expect(res.status).toBe(404);
  });

  it('읽을 수 없는 게시판의 글은 스크랩할 수 없다', async () => {
    const hidden = await createPost(adminCookie, `못볼글 ${Date.now()}`, 'adminonly');
    expect((await scrap(userCookie, hidden, 'adminonly')).status).toBe(403);
  });

  it('스크랩한 뒤 권한을 잃으면 목록에서 사라진다', async () => {
    const id = await createPost(adminCookie, `권한변경 ${Date.now()}`);
    await scrap(userCookie, id);
    expect(
      (
        await request(app).get('/api/posts/scraps/mine').set('Cookie', userCookie)
      ).body.data.posts.map((p: { id: string }) => p.id)
    ).toContain(id);

    // notice 읽기 권한 회수
    await BoardAccess.update({ canRead: false }, { where: { boardId: 'notice', roleId: 'user' } });
    const after = await request(app).get('/api/posts/scraps/mine').set('Cookie', userCookie);
    expect(after.body.data.posts.map((p: { id: string }) => p.id)).not.toContain(id);

    await BoardAccess.update({ canRead: true }, { where: { boardId: 'notice', roleId: 'user' } });
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/posts/scraps/mine')).status).toBe(401);
  });
});

describe('연타해도 오류가 나지 않는다', () => {
  // 버튼을 빠르게 두 번 누르면 두 요청이 모두 "아직 없음" 을 보고 동시에 만들려 든다.
  // 유니크 제약이 데이터는 지켜 주지만, 진 쪽이 그대로 터지면 사용자에게는 500 이 뜬다.
  // 스크랩 연타에서 12번 중 2번꼴로 재현된다.
  it('스크랩을 동시에 여러 번 눌러도 500 이 나지 않는다', async () => {
    const id = await createPost(adminCookie, '연타 스크랩');
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => scrap(userCookie, id))
    );
    const codes = results.map(r => (r.status === 'fulfilled' ? r.value.status : 0)).filter(Boolean);
    expect(codes.filter(c => c >= 500)).toEqual([]);

    // 데이터도 한 줄을 넘지 않는다
    const after = await request(app).get('/api/posts/scraps/mine?page=1').set('Cookie', userCookie);
    const mine = (after.body.data.posts ?? after.body.data.items ?? []) as { id: string }[];
    expect(mine.filter(p => p.id === id).length).toBeLessThanOrEqual(1);
  });
});
