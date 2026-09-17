// server/src/__tests__/secretPostAuditIp.test.ts
// 비밀글 비밀번호를 맞혀 보는 쪽이, 기록에 남을 자기 주소를 스스로 정할 수 있었다.
//
// verifySecretPost 는 ipAddress 를 x-forwarded-for 헤더에서 직접 읽었다. 그 헤더는
// 클라이언트가 붙이는 값이라 아무렇게나 쓸 수 있다 — 시도 횟수 제한은 req.ip 로 세고
// 있었으므로, 위조해서 이득을 보는 곳이 정확히 '감사 기록' 하나뿐이었다.
//
// Express 는 trust proxy 설정을 거친 값만 req.ip 로 준다(운영: 첫 프록시만 신뢰,
// 테스트/개발: 신뢰 안 함). 그래서 여기서 위조 헤더를 붙여도 req.ip 는 루프백이어야 한다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { securityLogService } from '../services/securityLog.service';

const FORGED_IP = '203.0.113.99';
const SECRET_PW = 'SecretPw123!';

type LoggedRow = { action: string; ipAddress: string | null; status?: string };

let authorCookie = '';
let proberCookie = '';
let spy: jest.SpyInstance;

const secretAccessRows = (): LoggedRow[] =>
  spy.mock.calls
    .map(c => c[0] as unknown as LoggedRow)
    .filter(r => r.action === 'SECRET_POST_ACCESS');

/** 비밀번호로 잠근 글을 하나 만든다. 글마다 시도 횟수를 따로 세므로 테스트끼리 간섭하지 않는다. */
async function createSecretPost(): Promise<string> {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', authorCookie)
    .send({
      title: `비밀글 ${Date.now()}${Math.random()}`,
      content: '<p>내용</p>',
      isSecret: true,
      secretType: 'password',
      secretPassword: SECRET_PW,
    });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

const verify = (id: string, password: string, forge: boolean) => {
  const req = request(app)
    .post(`/api/posts/notice/${id}/verify`)
    .set(CSRF_HEADER)
    .set('Cookie', proberCookie);
  if (forge) req.set('X-Forwarded-For', FORGED_IP);
  return req.send({ password });
};

beforeAll(async () => {
  await seedTestData();
  authorCookie = await loginAs('admin', 'TestAdmin123!');
  proberCookie = await loginAs('testuser', 'TestUser123!');
});

beforeEach(() => {
  spy = jest.spyOn(securityLogService, 'createLog').mockResolvedValue(undefined as never);
});

afterEach(() => {
  spy.mockRestore();
});

describe('비밀글 접근 기록의 IP', () => {
  it('헤더를 위조해도 그 값이 기록되지 않는다', async () => {
    const id = await createSecretPost();
    await verify(id, '틀린비밀번호', true);

    const rows = secretAccessRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].ipAddress).not.toBe(FORGED_IP);
    expect(rows[0].ipAddress).toContain('127.0.0.1');
  });

  it('실패한 시도도 기록된다 — 맞혀 보는 행위 자체가 남아야 한다', async () => {
    const id = await createSecretPost();
    await verify(id, '또틀린비밀번호', false);

    const rows = secretAccessRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('FAILURE');
  });

  it('성공한 접근도 기록된다 — 양성 대조', async () => {
    const id = await createSecretPost();
    const res = await verify(id, SECRET_PW, false);
    expect(res.status).toBe(200);

    const rows = secretAccessRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SUCCESS');
    expect(rows[0].ipAddress).toContain('127.0.0.1');
  });
});
