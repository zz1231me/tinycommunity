import request from 'supertest';
import { app, seedTestData, CSRF_HEADER } from './helpers';
import { RATE_LIMIT } from '../config/constants';

// 로그인 실패 횟수 제한.
//
// 계정 잠금(5회 실패 → 30분)은 이미 있었지만 그것은 '한 계정을 계속 두드리는' 것만
// 막는다. 흔한 비밀번호 하나를 아이디 수천 개에 한 번씩 뿌리면(password spraying)
// 어느 계정의 카운터도 올라가지 않아 그대로 통과했다. 아이디가 있는지 훑어보는 것도
// 제한이 없었다 — auth.service 의 주석이 그 사실을 적어 두고 있었다.
//
// ⚠️ 이 파일은 따로 있어야 한다. 요청 수 계수는 프로세스 안에 쌓이고 jest 는 파일마다
// 프로세스를 새로 띄우므로, 실패를 잔뜩 쌓는 이 검사를 다른 로그인 테스트와 같은 파일에
// 두면 그쪽의 정상 로그인이 429 로 막힌다.

const fail = (id: string) =>
  request(app).post('/api/auth/login').set(CSRF_HEADER).send({ id, password: 'WrongPass123!' });

const succeed = () =>
  request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ id: 'testuser', password: 'TestUser123!' });

beforeAll(async () => {
  await seedTestData();
});

describe('성공한 로그인은 한도를 깎지 않는다', () => {
  it('연달아 성공해도 막히지 않는다', async () => {
    // 이것이 먼저 돌아야 한다 — 아래에서 한도를 채우고 나면 맞는 비밀번호도 429 다.
    // 성공까지 세면 사무실에서 아침마다 서로의 몫을 깎아먹는다.
    for (let i = 0; i < 5; i++) {
      const res = await succeed();
      expect(res.status).toBe(200);
    }
  });
});

describe('실패는 센다', () => {
  it(`${RATE_LIMIT.LOGIN_FAIL_MAX}번까지는 통과하고 그 다음은 429`, async () => {
    // 없는 아이디로 두드린다. 한 계정을 계속 치면 계정 잠금이 먼저 걸려 응답 코드가
    // 섞이고, 무엇이 막은 것인지 알 수 없게 된다. 실제 spraying 도 이 모양이다.
    for (let i = 0; i < RATE_LIMIT.LOGIN_FAIL_MAX; i++) {
      const res = await fail(`nosuchuser${i}`);
      expect(res.status).not.toBe(429);
    }

    const blocked = await fail('nosuchuserlast');
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).toContain('너무 많습니다');
  });

  it('한도에 닿으면 비밀번호가 맞아도 그 창 동안은 막힌다', async () => {
    // 일부러 고정해 둔다. '성공은 세지 않는다' 와 '성공도 막히지 않는다' 는 다른 말이다.
    // 이 성질 때문에 한도를 넉넉히(50) 잡았다 — 낮으면 사무실 전체가 15분간 못 들어온다.
    const res = await succeed();
    expect(res.status).toBe(429);
  });
});
