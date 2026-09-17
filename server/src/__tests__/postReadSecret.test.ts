import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

// 비밀글의 읽음 확인.
//
// 두 가지가 빠져 있었다:
//
//  1) markRead 가 게시판만 맞으면 읽음 기록을 만들었다. 허용 목록에 없는 사람도
//     '읽었다' 를 남길 수 있어, 작성자의 확인 현황에 그 글을 열 수조차 없는 사람이
//     '읽음' 으로 올라왔다.
//
//  2) getReaders 의 '읽어야 할 사람' 을 게시판 권한만으로 셌다. 서른 명이 읽을 수 있는
//     게시판에 두 명만 지정한 비밀글의 현황이 '29명 중 0명' 으로 뜨고, 영영 열 수 없는
//     스물일곱 명이 '안 읽음' 목록에 남았다.

const THIRD = 'readerthird';
let adminCookie: string;
let userCookie: string;
let thirdCookie: string;

const markRead = (cookie: string, id: string) =>
  request(app).post(`/api/posts/notice/${id}/read`).set(CSRF_HEADER).set('Cookie', cookie);

const readers = (cookie: string, id: string) =>
  request(app).get(`/api/posts/notice/${id}/readers`).set('Cookie', cookie);

async function createPost(extra: Record<string, unknown> = {}): Promise<string> {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title: `읽음비밀 ${Date.now()}`, content: '<p>x</p>', ...extra });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

/** testuser 만 볼 수 있는 비밀글 */
const createSecretPost = () =>
  createPost({ isSecret: true, secretType: 'users', secretUserIds: ['testuser'] });

beforeAll(async () => {
  await seedTestData();
  for (const key of ['post.readReceipts']) {
    await FeatureFlag.destroy({ where: { key } });
    await FeatureFlag.create({ key, enabled: true });
  }
  featureFlagService.invalidate();

  if (!(await User.findByPk(THIRD))) {
    await User.create({
      id: THIRD,
      password: 'Test1234!',
      name: '제삼자',
      email: `${THIRD}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
  thirdCookie = await loginAs(THIRD, 'Test1234!');
});

describe('열 수 없는 글에는 읽음이 남지 않는다', () => {
  it('허용 목록에 없으면 읽음 처리가 막힌다', async () => {
    const id = await createSecretPost();
    const res = await markRead(thirdCookie, id);
    expect(res.status).toBe(403);
  });

  it('허용된 사람은 그대로 읽음 처리된다 — 양성 대조', async () => {
    // 이것이 없으면 '비밀글이면 전부 막기' 인 구현도 위 테스트를 통과한다
    const id = await createSecretPost();
    expect((await markRead(userCookie, id)).status).toBe(200);
  });

  it('평범한 글은 아무나 읽음 처리할 수 있다 — 기존 동작', async () => {
    const id = await createPost();
    expect((await markRead(thirdCookie, id)).status).toBe(200);
  });
});

describe('읽어야 할 사람도 허용 목록까지만 센다', () => {
  it('비밀글의 대상은 허용된 사람뿐이다', async () => {
    const id = await createSecretPost();
    const res = await readers(adminCookie, id);

    expect(res.status).toBe(200);
    // 작성자(admin)는 빠지고 허용된 testuser 만 남는다
    expect(res.body.data.total).toBe(1);

    const everyone = [
      ...res.body.data.readers.map((r: { id: string }) => r.id),
      ...res.body.data.unread.map((u: { id: string }) => u.id),
    ];
    expect(everyone).toContain('testuser');
    // 열 수도 없는 사람이 '안 읽음' 으로 남으면 안 된다
    expect(everyone).not.toContain(THIRD);
  });

  it('허용된 사람이 읽으면 읽음으로 잡힌다', async () => {
    const id = await createSecretPost();
    await markRead(userCookie, id);

    const res = await readers(adminCookie, id);
    expect(res.body.data.readCount).toBe(1);
    expect(res.body.data.readers[0].id).toBe('testuser');
    expect(res.body.data.unread).toHaveLength(0);
  });

  it('평범한 글의 대상은 좁아지지 않는다 — 양성 대조', async () => {
    // 비밀글 좁히기가 평범한 글까지 건드리면 확인 현황이 통째로 비어 버린다
    const id = await createPost();
    const res = await readers(adminCookie, id);

    expect(res.body.data.total).toBeGreaterThan(1);
    const everyone = [
      ...res.body.data.readers.map((r: { id: string }) => r.id),
      ...res.body.data.unread.map((u: { id: string }) => u.id),
    ];
    expect(everyone).toContain('testuser');
    expect(everyone).toContain(THIRD);
  });
});
