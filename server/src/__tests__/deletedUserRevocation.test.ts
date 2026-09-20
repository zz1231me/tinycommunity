// server/src/__tests__/deletedUserRevocation.test.ts
// 계정을 지우면 그 사람의 요청이 '그 자리에서' 막히는가.
//
// 미들웨어는 사용자 상태를 잠깐(수십 초) 캐시해 둔다. 비활성화·역할 변경·비밀번호 초기화는
// 모두 그 캐시를 비우고 토큰도 무효로 만드는데, 삭제만 둘 다 빠져 있었다 — 지운 직후에도
// 그 사람이 들고 있던 토큰으로 글을 쓸 수 있었다(캐시가 만료될 때까지).

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';

let adminCookie = '';

/** 테스트마다 새 계정을 쓴다 — 지운 계정을 되살려 쓰면 승인 상태가 달라진다 */
async function makeVictim(id: string) {
  await User.destroy({ where: { id }, force: true });
  const created = await request(app)
    .post('/api/admin/users')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ id, name: '지워질 사람', password: 'TestVictim123!', roleId: 'user' });
  expect(created.status).toBeLessThan(400);
  return loginAs(id, 'TestVictim123!');
}

const removeUser = (id: string) =>
  request(app).delete(`/api/admin/users/${id}`).set(CSRF_HEADER).set('Cookie', adminCookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

describe('지운 계정은 그 자리에서 막힌다', () => {
  it('삭제 직후의 요청이 통하지 않는다', async () => {
    const cookie = await makeVictim('delvictima');
    // 먼저 한 번 요청해 캐시를 데워 둔다 — 이 캐시가 문제의 원인이었다
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);

    expect((await removeUser('delvictima')).status).toBe(200);

    const after = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(after.status).toBeGreaterThanOrEqual(400);
  });

  it('삭제 직후에는 글도 쓸 수 없다', async () => {
    const cookie = await makeVictim('delvictimb');
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    await removeUser('delvictimb');

    const write = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .send({ title: '지워진 계정의 글', content: '<p>x</p>' });

    expect(write.status).toBeGreaterThanOrEqual(400);
  });

  it('지우지 않은 계정은 그대로 쓸 수 있다 — 대조', async () => {
    const cookie = await makeVictim('delvictimc');
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
  });
});
