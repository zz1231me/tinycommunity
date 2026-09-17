// server/src/__tests__/securityErrorLogger.test.ts
// 권한 없는 요청과 이상 징후가 기록으로 남는가.
//
// 남기기 전에는 토큰 없이·위조 토큰으로 관리자 API 를 긁어도 error/security/audit
// 어디에도 아무것도 남지 않았다(실측: 무인증 요청 6건 → 세 테이블 모두 증가 0).
//
// 여기서 고정하는 것은 넷이다.
//   1. 401 도 남는다 — 특히 서명이 위조된 토큰
//   2. 앱을 열 때 항상 나는 401(/auth/me, /auth/refresh)은 남기지 않는다
//   3. 400·404 는 남기되 'info' 로 낮추고 /api 안에서만 본다
//   4. 같은 행위자가 쏟아내면 묶고, 묶인 건수는 잃지 않는다
// 2 와 3 이 없으면 평범한 방문·오타가 로그를 채워 1 의 신호를 덮는다.

import request from 'supertest';
import express from 'express';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { errorLogService } from '../services/errorLog.service';
import { resetSecurityLogThrottle, securityErrorLogger } from '../middlewares/securityErrorLogger';

type LoggedRow = {
  errorCode: string;
  route: string;
  method: string;
  errorMessage: string;
  severity: string;
  requestBody?: {
    ip?: string;
    userAgent?: string;
    body?: Record<string, unknown>;
    suppressed?: number;
  };
};

let adminCookie = '';
let spy: jest.SpyInstance;

const rows = (): LoggedRow[] => spy.mock.calls.map(c => c[0] as unknown as LoggedRow);
const logged = (code: string): LoggedRow[] => rows().filter(r => r.errorCode === code);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

beforeEach(() => {
  // DB 에 실제로 쓰지 않고 "무엇을 남기려 했는가" 만 본다.
  spy = jest.spyOn(errorLogService, 'createLog').mockResolvedValue(undefined);
  // 앞 스위트가 써 버린 몫 때문에 여기 기록이 억제되면 안 된다.
  resetSecurityLogThrottle();
});

afterEach(() => {
  spy.mockRestore();
});

describe('권한 없는 요청의 기록', () => {
  it('토큰 없이 관리자 API 를 긁으면 401 이 기록된다', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);

    const hits = logged('HTTP_401');
    expect(hits).toHaveLength(1);
    expect(hits[0].route).toBe('/api/admin/users');
    expect(hits[0].method).toBe('GET');
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].errorMessage).toContain('인증 없는 접근 시도');
  });

  it('서명이 위조된 토큰도 401 로 기록된다 — 가장 분명한 공격 신호', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', 'access_token=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImFkbWluIn0.forged-signature');
    expect(res.status).toBe(401);
    expect(logged('HTTP_401')).toHaveLength(1);
  });

  it('기록에 IP 와 요청 수단이 함께 담긴다 — 누가 그랬는지 추적할 수 있어야 한다', async () => {
    await request(app).get('/api/admin/ip-rules');
    const hit = logged('HTTP_401')[0];
    expect(hit.requestBody?.ip).toBeTruthy();
    expect(hit.route).toBe('/api/admin/ip-rules');
  });

  it('본문에 섞인 비밀번호는 가려서 기록한다', async () => {
    await request(app)
      .post('/api/admin/users')
      .set(CSRF_HEADER)
      .send({ id: 'victim', password: 'SuperSecret123!' });

    const hit = logged('HTTP_401')[0];
    expect(hit.requestBody?.body?.password).toBe('[REDACTED]');
    expect(JSON.stringify(hit)).not.toContain('SuperSecret123!');
  });

  it('비밀번호 재설정 인증번호도 가려서 기록한다', async () => {
    // 이 값은 계정을 넘겨받는 데 쓴다. 틀린 요청은 400 으로 기록에 남는데,
    // 민감어 목록이 부분 일치라 'code' 를 그냥 넣으면 zipcode·qrcode 까지 덮는다 —
    // 그래서 이름이 정확히 'code' 인 칸만 가리도록 따로 두었다.
    await request(app)
      .post('/api/auth/password-reset-verify')
      .set(CSRF_HEADER)
      .send({ loginId: 'someone', code: 'NOT6DIGITS', password: 'Whatever123!' });

    const hit = logged('HTTP_400')[0];
    expect(hit.requestBody?.body?.code).toBe('[REDACTED]');
    expect(JSON.stringify(hit)).not.toContain('NOT6DIGITS');
    // 같은 본문의 새 비밀번호도 함께 가려져 있어야 한다
    expect(hit.requestBody?.body?.password).toBe('[REDACTED]');
  });
});

describe('이상 징후(400·404)는 등급을 낮춰 남긴다', () => {
  it('없는 API 를 짚으면 404 가 info 로 남는다 — 자원 훑기의 신호', async () => {
    const res = await request(app).get('/api/wp-admin');
    expect(res.status).toBe(404);

    const hits = logged('HTTP_404');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('info');
    expect(hits[0].errorMessage).toContain('탐색 가능성');
  });

  it('잘못된 입력은 400 이 info 로 남는다 — 값 조작의 신호', async () => {
    const res = await request(app).post('/api/auth/register').set(CSRF_HEADER).send({ id: 'x' });
    expect(res.status).toBe(400);

    const hits = logged('HTTP_400');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('info');
  });

  // 이 규칙은 실제 앱으로 검사할 수 없다. client/dist 가 있으면 SPA 폴백이 켜져
  // /api 바깥 경로가 전부 200(index.html)이 되는데, 그 존재 여부가 기계마다 다르다
  // — 클라이언트를 빌드해 둔 로컬에는 있고, 서버 잡만 도는 CI 에는 없다.
  // 그래서 미들웨어만 얹은 최소 앱으로 규칙 자체를 고정한다.
  it('API 바깥의 404 는 남기지 않는다 — 없는 이미지·새로고침까지 적히면 쓸모없다', async () => {
    const bare = express();
    bare.use(securityErrorLogger);
    bare.use((_req, res) => {
      res.status(404).json({ message: '없음' });
    });

    expect((await request(bare).get('/favicon-does-not-exist.png')).status).toBe(404);
    expect(logged('HTTP_404')).toHaveLength(0);

    // 양성 대조 — 같은 최소 앱에서 /api 경로는 남는다.
    // 이게 없으면 위의 '0건' 이 미들웨어가 아예 안 도는 경우에도 통과한다.
    expect((await request(bare).get('/api/none')).status).toBe(404);
    expect(logged('HTTP_404')).toHaveLength(1);
  });
});

describe('쏟아내면 묶는다', () => {
  it('같은 행위자의 같은 유형은 1분에 5건까지만 적는다', async () => {
    for (let i = 0; i < 8; i++) {
      await request(app).get(`/api/admin/users?probe=${i}`);
    }
    expect(logged('HTTP_401')).toHaveLength(5);
  });

  it('묶인 건수는 다음 기록에 실려 보존된다 — 훑기와 실수를 구분할 수 있어야 한다', async () => {
    const t0 = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(t0);
    try {
      for (let i = 0; i < 8; i++) {
        await request(app).get(`/api/admin/users?probe=${i}`);
      }
      expect(logged('HTTP_401')).toHaveLength(5); // 3건 억제

      clock.mockReturnValue(t0 + 61_000); // 다음 창
      await request(app).get('/api/admin/users?probe=next');

      const hits = logged('HTTP_401');
      expect(hits).toHaveLength(6);
      expect(hits[5].errorMessage).toContain('3건이 더 있었다');
      expect(hits[5].requestBody?.suppressed).toBe(3);
    } finally {
      clock.mockRestore();
    }
  });
});

describe('정상 흐름은 남기지 않는다', () => {
  it('앱을 열 때 나는 /auth/me 의 401 은 기록하지 않는다', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(logged('HTTP_401')).toHaveLength(0);
  });

  it('/auth/refresh 의 401 도 기록하지 않는다', async () => {
    const res = await request(app).post('/api/auth/refresh').set(CSRF_HEADER);
    expect(res.status).toBe(401);
    expect(logged('HTTP_401')).toHaveLength(0);
  });

  it('정상 인증된 요청은 아무것도 기록하지 않는다 — 음성 대조', async () => {
    const res = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('기존 동작 회귀 방지', () => {
  it('CSRF 없는 쓰기의 403 은 전과 같이 warning 으로 기록된다', async () => {
    const res = await request(app).post('/api/memos').send({ content: '테스트' });
    expect(res.status).toBe(403);
    expect(logged('HTTP_403')).toHaveLength(1);
    expect(logged('HTTP_403')[0].severity).toBe('warning');
    expect(logged('HTTP_403')[0].errorMessage).toContain('권한 없는 접근 시도');
  });
});
