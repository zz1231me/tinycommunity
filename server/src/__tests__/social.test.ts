import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { Notification } from '../models/Notification';
import { NotificationSetting } from '../models/NotificationSetting';
import { Subscription } from '../models/Subscription';

// 구독·팔로우 알림, 알림 설정, 다른 사람 프로필.
//
// 여기서 지켜야 하는 선은 두 가지다.
//  1. 구독은 알림을 받겠다는 뜻이지 열람 권한이 아니다 — 못 보는 글의 알림이 가면 안 된다.
//  2. 끈 알림은 실제로 오지 않아야 한다.

let adminCookie: string;
let userCookie: string;

async function createPost(cookie: string, title: string, board = 'notice', extra = {}) {
  const res = await request(app)
    .post(`/api/posts/${board}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content: `<p>${title}</p>`, ...extra });
  return res;
}

function subscribe(cookie: string, targetType: string, targetId: string) {
  return request(app)
    .post(`/api/social/subscriptions/${targetType}/${targetId}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie);
}

/** 알림은 fire-and-forget 이라 응답 이후에 쓰인다 — 잠시 기다렸다 확인한다 */
async function notificationsFor(userId: string, type: string) {
  await new Promise(r => setTimeout(r, 250));
  return Notification.findAll({ where: { userId, type }, order: [['id', 'DESC']] });
}

async function clearSocialState() {
  await Subscription.destroy({ where: {}, truncate: true });
  await NotificationSetting.destroy({ where: {}, truncate: true });
  await Notification.destroy({ where: {} });
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다

  // testuser 가 읽을 수 없는 게시판 — 구독이 권한을 우회하지 않는지 확인용
  await Board.findOrCreate({
    where: { id: 'secretboard' },
    defaults: {
      id: 'secretboard',
      name: '관리자 전용',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      order: 5,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: 'secretboard', roleId: 'admin' },
    defaults: {
      boardId: 'secretboard',
      roleId: 'admin',
      canRead: true,
      canWrite: true,
      canDelete: true,
    },
  });

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

afterEach(clearSocialState);

describe('구독 토글', () => {
  it('게시판을 구독하고 다시 누르면 해제된다', async () => {
    expect((await subscribe(userCookie, 'board', 'notice')).body.data.subscribed).toBe(true);
    expect((await subscribe(userCookie, 'board', 'notice')).body.data.subscribed).toBe(false);
  });

  it('사람을 팔로우할 수 있다', async () => {
    const res = await subscribe(userCookie, 'user', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.data.subscribed).toBe(true);
  });

  it('자기 자신은 팔로우할 수 없다', async () => {
    expect((await subscribe(userCookie, 'user', 'testuser')).status).toBe(400);
  });

  it('없는 게시판은 구독할 수 없다', async () => {
    expect((await subscribe(userCookie, 'board', 'nosuchboard')).status).toBe(404);
  });

  it('없는 사용자는 팔로우할 수 없다', async () => {
    expect((await subscribe(userCookie, 'user', 'ghost')).status).toBe(404);
  });

  it('board/user 가 아닌 대상은 400', async () => {
    expect((await subscribe(userCookie, 'planet', 'mars')).status).toBe(400);
  });

  it('목록에 구독한 대상이 이름과 함께 나온다', async () => {
    await subscribe(userCookie, 'board', 'notice');
    await subscribe(userCookie, 'user', 'admin');

    const res = await request(app).get('/api/social/subscriptions').set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((s: { name: string }) => s.name).sort()).toEqual(
      ['공지사항', '관리자'].sort()
    );
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/social/subscriptions')).status).toBe(401);
  });
});

describe('새 글 알림', () => {
  it('구독한 게시판에 글이 올라오면 알림이 온다', async () => {
    await subscribe(userCookie, 'board', 'notice');
    await createPost(adminCookie, `구독알림 ${Date.now()}`);

    const notes = await notificationsFor('testuser', 'SUBSCRIPTION');
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('관리자');
  });

  it('팔로우한 사람이 글을 올려도 알림이 온다', async () => {
    await subscribe(userCookie, 'user', 'admin');
    await createPost(adminCookie, `팔로우알림 ${Date.now()}`);

    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(1);
  });

  it('게시판과 작성자를 모두 구독해도 알림은 하나다', async () => {
    await subscribe(userCookie, 'board', 'notice');
    await subscribe(userCookie, 'user', 'admin');
    await createPost(adminCookie, `중복방지 ${Date.now()}`);

    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(1);
  });

  it('내가 쓴 글로는 나에게 알림이 오지 않는다', async () => {
    await subscribe(adminCookie, 'board', 'notice');
    await createPost(adminCookie, `자기글 ${Date.now()}`);

    expect(await notificationsFor('admin', 'SUBSCRIPTION')).toHaveLength(0);
  });

  it('구독하지 않았으면 알림이 오지 않는다', async () => {
    await createPost(adminCookie, `무구독 ${Date.now()}`);
    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(0);
  });

  it('비밀글은 구독자에게도 알리지 않는다', async () => {
    // 제목만으로도 "누가 무엇에 대해 비밀글을 썼다" 가 새어 나간다
    await subscribe(userCookie, 'board', 'notice');
    const res = await createPost(adminCookie, `비밀 ${Date.now()}`, 'notice', {
      isSecret: true,
      secretType: 'password',
      secretPassword: 'secret1234',
    });
    expect(res.status).toBe(201);

    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(0);
  });

  it('읽을 수 없는 게시판의 글은 그 게시판을 구독해도 알림이 오지 않는다', async () => {
    // 구독은 알림을 받겠다는 뜻이지 권한이 아니다
    await Subscription.create({ userId: 'testuser', targetType: 'board', targetId: 'secretboard' });
    await createPost(adminCookie, `권한밖 ${Date.now()}`, 'secretboard');

    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(0);
  });

  it('작성자를 팔로우해도 못 보는 게시판의 글은 알리지 않는다', async () => {
    await subscribe(userCookie, 'user', 'admin');
    await createPost(adminCookie, `팔로우권한밖 ${Date.now()}`, 'secretboard');

    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(0);
  });
});

describe('알림 설정', () => {
  it('종류 목록과 현재 값을 준다', async () => {
    const res = await request(app)
      .get('/api/social/notification-settings')
      .set('Cookie', userCookie);
    expect(res.status).toBe(200);
    const keys = res.body.data.kinds.map((k: { key: string }) => k.key);
    expect(keys).toEqual(
      expect.arrayContaining(['COMMENT', 'LIKE', 'MENTION', 'SUBSCRIPTION', 'SYSTEM'])
    );
    expect(res.body.data.kinds.every((k: { enabled: boolean }) => k.enabled)).toBe(true);
  });

  it('운영 공지는 끌 수 없다고 표시한다', async () => {
    const res = await request(app)
      .get('/api/social/notification-settings')
      .set('Cookie', userCookie);
    const system = res.body.data.kinds.find((k: { key: string }) => k.key === 'SYSTEM');
    expect(system.configurable).toBe(false);
  });

  it('끄면 그 종류의 알림이 실제로 오지 않는다', async () => {
    const saved = await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ SUBSCRIPTION: false });
    expect(saved.status).toBe(200);

    await subscribe(userCookie, 'board', 'notice');
    await createPost(adminCookie, `꺼진알림 ${Date.now()}`);

    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(0);
  });

  it('다시 켜면 알림이 돌아온다', async () => {
    await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ SUBSCRIPTION: false });
    await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ SUBSCRIPTION: true });

    await subscribe(userCookie, 'board', 'notice');
    await createPost(adminCookie, `복구알림 ${Date.now()}`);

    expect(await notificationsFor('testuser', 'SUBSCRIPTION')).toHaveLength(1);
  });

  it('한 사람의 설정이 다른 사람에게 옮지 않는다', async () => {
    await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ SUBSCRIPTION: false });

    const other = await request(app)
      .get('/api/social/notification-settings')
      .set('Cookie', adminCookie);
    const sub = other.body.data.kinds.find((k: { key: string }) => k.key === 'SUBSCRIPTION');
    expect(sub.enabled).toBe(true);
  });

  it('운영 공지를 끄려 하면 400 — 조용히 무시하지 않는다', async () => {
    const res = await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ SYSTEM: false });
    expect(res.status).toBe(400);
  });

  it('모르는 종류는 400', async () => {
    const res = await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ NOPE: false });
    expect(res.status).toBe(400);
  });

  it('true/false 가 아니면 400', async () => {
    const res = await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ COMMENT: 'no' });
    expect(res.status).toBe(400);
  });
});

describe('다른 사람 프로필', () => {
  it('이름·가입일·활동 수를 준다', async () => {
    const res = await request(app).get('/api/users/admin/profile').set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('관리자');
    expect(res.body.data.isSelf).toBe(false);
    expect(typeof res.body.data.postCount).toBe('number');
    expect(typeof res.body.data.commentCount).toBe('number');
  });

  it('내 프로필을 열면 isSelf 가 true', async () => {
    const res = await request(app).get('/api/users/testuser/profile').set('Cookie', userCookie);
    expect(res.body.data.isSelf).toBe(true);
  });

  it('팔로우 여부와 팔로워 수가 반영된다', async () => {
    await subscribe(userCookie, 'user', 'admin');

    const res = await request(app).get('/api/users/admin/profile').set('Cookie', userCookie);
    expect(res.body.data.isFollowing).toBe(true);
    expect(res.body.data.followers).toBe(1);
  });

  it('읽을 수 없는 게시판의 글은 최근 글에도 개수에도 넣지 않는다', async () => {
    const before = await request(app).get('/api/users/admin/profile').set('Cookie', userCookie);
    await createPost(adminCookie, `프로필숨김 ${Date.now()}`, 'secretboard');
    const after = await request(app).get('/api/users/admin/profile').set('Cookie', userCookie);

    expect(after.body.data.postCount).toBe(before.body.data.postCount);
    expect(
      after.body.data.recentPosts.some((p: { boardType: string }) => p.boardType === 'secretboard')
    ).toBe(false);
  });

  it('읽을 수 없는 게시판의 댓글도 개수에 넣지 않는다', async () => {
    // 글 수만 거르고 댓글 수는 전체를 세면, 화면의 "읽을 수 있는 게시판만 집계합니다" 가
    // 거짓말이 되고 못 보는 게시판의 활동량이 숫자로 새어 나간다.
    const hidden = await createPost(adminCookie, `댓글숨김 ${Date.now()}`, 'secretboard');
    const before = await request(app).get('/api/users/admin/profile').set('Cookie', userCookie);

    const comment = await request(app)
      .post(`/api/comments/secretboard/${hidden.body.data.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ content: '보이면 안 되는 댓글' });
    expect([200, 201]).toContain(comment.status);

    const after = await request(app).get('/api/users/admin/profile').set('Cookie', userCookie);
    expect(after.body.data.commentCount).toBe(before.body.data.commentCount);
  });

  it('비밀글은 최근 글에 넣지 않는다', async () => {
    await createPost(adminCookie, `프로필비밀 ${Date.now()}`, 'notice', {
      isSecret: true,
      secretType: 'password',
      secretPassword: 'secret1234',
    });

    const res = await request(app).get('/api/users/admin/profile').set('Cookie', userCookie);
    expect(
      res.body.data.recentPosts.some((p: { title: string }) => p.title.includes('프로필비밀'))
    ).toBe(false);
  });

  it('없는 사용자는 404', async () => {
    expect(
      (await request(app).get('/api/users/ghost/profile').set('Cookie', userCookie)).status
    ).toBe(404);
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/users/admin/profile')).status).toBe(401);
  });
});
