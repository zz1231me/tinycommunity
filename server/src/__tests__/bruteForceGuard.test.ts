// server/src/__tests__/bruteForceGuard.test.ts
// 비밀을 맞혀 보는 요청의 시도 횟수 제한.
//
// 6자리 TOTP 와 비밀글 비밀번호는 횟수를 막지 않으면 전부 해 보면 뚫린다.
// 계수는 사용자·글 단위라 전용 사용자와 전용 글 id 로 다른 스위트와 섞이지 않게 한다.

import request from 'supertest';
import { app, seedTestData, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { RATE_LIMIT } from '../config/constants';

const PASSWORD = 'TestUser123!';
const BOARD = 'bf-board';
let cookie = '';

async function login(id: string) {
  if (!(await User.findByPk(id))) {
    await User.create({
      id,
      password: PASSWORD,
      name: '무차별',
      email: `${id}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
  const res = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ id, password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map(c => c.split(';')[0]).join('; ');
}

const verify = (postId: string) =>
  request(app)
    .post(`/api/posts/${BOARD}/${postId}/verify`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ password: 'wrong' });

beforeAll(async () => {
  await seedTestData();
  await BoardAccess.destroy({ where: { boardId: BOARD } });
  await Board.destroy({ where: { id: BOARD }, force: true });
  await Board.create({
    id: BOARD,
    name: '무차별 테스트',
    description: null,
    isActive: true,
    order: 950,
    ownerId: null,
  });
  await BoardAccess.create({
    boardId: BOARD,
    roleId: 'user',
    canRead: true,
    canWrite: false,
    canDelete: false,
  });
  cookie = await login('bfuser');
});

describe('비밀글 비밀번호 시도 제한', () => {
  it(`같은 글에 ${RATE_LIMIT.SECRET_POST_MAX}번까지는 통과하고 그 다음은 429`, async () => {
    const postId = 'bf-post-a';
    for (let i = 1; i <= RATE_LIMIT.SECRET_POST_MAX; i++) {
      const res = await verify(postId);
      // 글이 없거나 비밀번호가 틀려 실패하는 것은 정상 — 막히지만 않으면 된다
      expect(res.status).not.toBe(429);
    }
    const blocked = await verify(postId);
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).toContain('시도 횟수를 초과');
  });

  it('글이 다르면 계수도 따로다 — 한 글이 막혀도 다른 글은 시도할 수 있다', async () => {
    const res = await verify('bf-post-b');
    expect(res.status).not.toBe(429);
  });
});

describe('2FA 설정 변경 시도 제한', () => {
  it('10번까지는 통과하고 11번째는 429', async () => {
    const twofaCookie = await login('bf2fa');
    const hit = () =>
      request(app)
        .post('/api/2fa/enable')
        .set(CSRF_HEADER)
        .set('Cookie', twofaCookie)
        .send({ token: '000000' });

    for (let i = 1; i <= 10; i++) {
      expect((await hit()).status).not.toBe(429);
    }
    const blocked = await hit();
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).toContain('시도 횟수를 초과');
  });
});
