import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER, relaxRateLimits } from './helpers';
import User from '../models/User';
import Post from '../models/Post';

// 비밀글 수정 경로 무작위 조합 점검.
//
// isSecret 과 secretType 조합에서 한쪽만 갱신되면 조회 경로의 password/users 분기가
// 모두 빗나가 본문이 그대로 노출될 수 있다. 조합 하나씩 막는 대신 전체를 훑는다.
//
// 두 가지를 확인한다:
//   1) 어떤 조합도 500 을 내지 않는다 (검증이 DB 쓰기 안쪽으로 새지 않았다)
//   2) 어떤 조합을 거쳐도 isSecret 인 글의 본문이 남에게 보이지 않는다 (닫힌 쪽이 기본값)

const SECRET_BODY = '<p>절대 새면 안 되는 내용</p>';

let ownerCookie: string;
let otherCookie: string;

beforeAll(async () => {
  await seedTestData();
  await relaxRateLimits();
  for (const [id, name] of [
    ['fuzzowner', '퍼즈주인'],
    ['fuzzother', '퍼즈타인'],
  ]) {
    if (!(await User.findByPk(id))) {
      await User.create({
        id,
        password: 'Test1234!',
        name,
        email: `${id}@test.com`,
        roleId: 'user',
        isActive: true,
      });
    }
  }
  ownerCookie = await loginAs('fuzzowner', 'Test1234!');
  otherCookie = await loginAs('fuzzother', 'Test1234!');
});

async function makeSecret() {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', ownerCookie)
    .send({
      title: `퍼즈 ${Date.now()}${Math.random()}`,
      content: SECRET_BODY,
      isSecret: true,
      secretType: 'users',
      secretUserIds: ['fuzzowner'],
    });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

// 수정 요청에 실어 보낼 값들 — 생략(undefined) 도 하나의 경우다
const IS_SECRET = [undefined, true, false, 'true', 'false', null, 1, 0, 'yes'];
const SECRET_TYPE = [undefined, 'users', 'password', null, '', 'other', 0, [], {}];
const USER_IDS = [undefined, ['fuzzowner'], [], null, '', 'fuzzother', [null], [123]];

describe('비밀글 수정 조합 훑기', () => {
  it('어떤 조합도 500 을 내지 않고, 본문도 새지 않는다', async () => {
    const crashes: string[] = [];
    const leaks: string[] = [];

    const cases: Record<string, unknown>[] = [];
    for (const secretType of SECRET_TYPE) {
      for (const secretUserIds of USER_IDS) {
        const body: Record<string, unknown> = { isSecret: true };
        if (secretType !== undefined) body.secretType = secretType;
        if (secretUserIds !== undefined) body.secretUserIds = secretUserIds;
        cases.push(body);
      }
    }
    // isSecret 자체가 이상한 값일 때도 같은 기준으로 본다
    for (const isSecret of IS_SECRET) {
      if (isSecret === undefined) continue;
      cases.push({ isSecret, secretType: 'users', secretUserIds: ['fuzzowner'] });
    }

    for (const extra of cases) {
      const id = await makeSecret();
      const body = { title: '수정', content: SECRET_BODY, ...extra };

      const res = await request(app)
        .put(`/api/posts/notice/${id}`)
        .set(CSRF_HEADER)
        .set('Cookie', ownerCookie)
        .send(body);
      if (res.status >= 500) crashes.push(`${res.status} ${JSON.stringify(extra)}`);

      // 비밀글을 푼 요청(isSecret 이 거짓)만 공개가 된다 — 그 외에는 계속 비밀글이어야 한다
      const saved = await Post.findByPk(id);
      const stillSecret = saved?.isSecret === true;
      if (!stillSecret) continue;

      const seen = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', otherCookie);
      if (JSON.stringify(seen.body).includes('절대 새면 안 되는 내용')) {
        leaks.push(`${seen.status} ${JSON.stringify(extra)}`);
      }
    }

    expect(crashes).toEqual([]);
    expect(leaks).toEqual([]);
  }, 180_000);
});
