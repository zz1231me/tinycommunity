// server/src/__tests__/logIntegrity.test.ts
// 기록이 조용히 사라지지 않는가.
//
// 세 가지를 고정한다.
//   1. 없는 계정으로의 로그인 실패도 남는다 — 남기기 전에는 아이디를 훑어도 흔적이 0 이었다
//      (실측: 없는 계정 로그인 실패 → security_logs·login_history 모두 증가 0).
//   2. 그러면서 응답은 실재 계정일 때와 한 글자도 같아야 한다. 다르면 기록을 얻는 대신
//      계정 존재 여부를 알려 주는 오라클을 만드는 셈이라, 고치려던 것보다 나쁘다.
//   3. 컬럼 폭을 넘기는 값은 잘려서라도 저장된다. 자르지 않으면 MySQL·PostgreSQL 에서
//      INSERT 가 거부되고 로그 서비스가 실패를 삼켜, 긴 URL 을 쓰는 것만으로 흔적이 지워진다.
//      (SQLite 는 길이를 강제하지 않아 로컬 테스트로는 이 실패가 재현되지 않는다 —
//       그래서 DB 에 넣기 직전 값을 가로채 길이를 본다.)

import request from 'supertest';
import { app, seedTestData, CSRF_HEADER } from './helpers';
import { securityLogService } from '../services/securityLog.service';
import { loginHistoryService } from '../services/loginHistory.service';
import { errorLogService } from '../services/errorLog.service';
import { ErrorLog } from '../models/ErrorLog';
import { SecurityLog } from '../models/SecurityLog';
import { clampText } from '../utils/clamp';
import { LoginHistory } from '../models/LoginHistory';
import bcrypt from 'bcryptjs';

beforeAll(async () => {
  await seedTestData();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const login = (id: string, password: string) =>
  request(app).post('/api/auth/login').set(CSRF_HEADER).send({ id, password });

describe('없는 계정으로의 로그인 시도', () => {
  it('보안 로그에 남고, 무슨 아이디를 시도했는지까지 남는다', async () => {
    const sec = jest.spyOn(securityLogService, 'createLog').mockResolvedValue(undefined);

    const res = await login('__never_existed__', 'whatever12345');
    expect(res.status).toBe(401);

    expect(sec).toHaveBeenCalledTimes(1);
    const row = sec.mock.calls[0][0] as { action: string; status: string; details?: unknown };
    expect(row.action).toBe('LOGIN_FAILED');
    expect(row.status).toBe('FAILURE');
    expect(row.details).toMatchObject({ attemptedId: '__never_existed__' });
  });

  it('로그인 이력에도 남는다 — 훑는 행위가 화면에서 보여야 한다', async () => {
    const hist = jest.spyOn(loginHistoryService, 'createLoginRecord').mockResolvedValue(undefined);

    await login('__never_existed__', 'whatever12345');

    expect(hist).toHaveBeenCalledTimes(1);
    const row = hist.mock.calls[0][0] as {
      userId?: string | null;
      status: string;
      failureReason?: string | null;
    };
    expect(row.userId).toBe('__never_existed__');
    expect(row.status).toBe('failed');
    expect(row.failureReason).toContain('존재하지 않는');
  });

  it('응답은 실재 계정 오답과 구별할 수 없다 — 계정 존재 여부 오라클 방지', async () => {
    jest.spyOn(securityLogService, 'createLog').mockResolvedValue(undefined);
    jest.spyOn(loginHistoryService, 'createLoginRecord').mockResolvedValue(undefined);

    const unknown = await login('__never_existed__', 'whatever12345');
    const wrongPw = await login('admin', 'definitely-not-the-password');

    expect(unknown.status).toBe(wrongPw.status);
    expect(unknown.body).toEqual(wrongPw.body);
  });

  it('실재 계정의 오답도 전과 같이 남는다 — 회귀 방지', async () => {
    const sec = jest.spyOn(securityLogService, 'createLog').mockResolvedValue(undefined);
    jest.spyOn(loginHistoryService, 'createLoginRecord').mockResolvedValue(undefined);

    await login('admin', 'definitely-not-the-password');

    const actions = sec.mock.calls.map(c => (c[0] as { action: string }).action);
    expect(actions).toContain('LOGIN_FAILED');
  });
});

describe('컬럼 폭을 넘기는 값은 잘려서라도 남는다', () => {
  it('에러 로그: 긴 route 가 500자로 잘린다', async () => {
    const create = jest.spyOn(ErrorLog, 'create').mockResolvedValue({} as unknown as ErrorLog);

    await errorLogService.createLog({
      route: '/api/x?' + 'a'.repeat(3000),
      method: 'GET',
      errorCode: 'HTTP_401',
      errorMessage: '테스트',
      severity: 'warning',
    });

    const saved = create.mock.calls[0][0] as { route: string };
    expect(saved.route).toHaveLength(500);
  });

  it('에러 로그: 거대한 requestBody 는 크기만 남기고 잘린다', async () => {
    const create = jest.spyOn(ErrorLog, 'create').mockResolvedValue({} as unknown as ErrorLog);

    const huge: Record<string, string> = {};
    for (let i = 0; i < 3000; i++) huge[`k${i}`] = 'v'.repeat(50);

    await errorLogService.createLog({
      route: '/api/x',
      method: 'POST',
      errorCode: 'HTTP_401',
      errorMessage: '테스트',
      severity: 'warning',
      requestBody: { body: huge },
    });

    const saved = create.mock.calls[0][0] as { requestBody: { _truncated?: boolean } };
    expect(saved.requestBody._truncated).toBe(true);
    expect(JSON.stringify(saved.requestBody).length).toBeLessThan(10_000);
  });

  it('보안 로그: 긴 route 가 500자로 잘린다', async () => {
    const create = jest
      .spyOn(SecurityLog, 'create')
      .mockResolvedValue({} as unknown as SecurityLog);

    await securityLogService.createLog({
      userId: 'admin',
      ipAddress: '127.0.0.1',
      action: 'SECRET_POST_ACCESS',
      method: 'POST',
      route: '/api/y?' + 'b'.repeat(3000),
      status: 'FAILURE',
    });

    const saved = create.mock.calls[0][0] as { route: string };
    expect(saved.route).toHaveLength(500);
  });

  it('짧은 값은 건드리지 않는다 — 음성 대조', async () => {
    const create = jest.spyOn(ErrorLog, 'create').mockResolvedValue({} as unknown as ErrorLog);

    await errorLogService.createLog({
      route: '/api/short',
      method: 'GET',
      errorCode: 'HTTP_404',
      errorMessage: '테스트',
      severity: 'info',
      requestBody: { body: { a: 1 } },
    });

    const saved = create.mock.calls[0][0] as { route: string; requestBody: unknown };
    expect(saved.route).toBe('/api/short');
    expect(saved.requestBody).toEqual({ body: { a: 1 } });
  });
});

describe('로깅이 응답을 깨뜨리지 않는다', () => {
  it('기록 중 예외가 나도 요청은 정상으로 끝난다', async () => {
    // 훅은 res.end 이후에 돈다. 여기서 던지면 이미 내보낸 응답 뒤에서 예외가 터져
    // 연결이 끊기거나 'headers already sent' 로 번질 수 있다.
    jest.spyOn(errorLogService, 'createLog').mockImplementation(() => {
      throw new Error('디스크 장애 흉내');
    });

    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message');
  });
});

describe('자를 때 글자를 깨뜨리지 않는다', () => {
  it('이모지(서로게이트 쌍)를 반토막 내지 않는다', () => {
    const s = 'a'.repeat(499) + '😀';
    const out = clampText(s, 500);

    // 쌍이 쪼개지느니 한 글자 덜 가져간다
    expect(out).toHaveLength(499);
    const last = out.charCodeAt(out.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    // 짝 잃은 서로게이트가 남으면 UTF-8 왕복에서 U+FFFD 로 뭉개진다
    expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out);
  });

  it('경계에 이모지가 없으면 정확히 max 자로 자른다 — 음성 대조', () => {
    expect(clampText('가'.repeat(600), 500)).toHaveLength(500);
  });
});

describe('로그인 이력도 컬럼 폭을 지킨다', () => {
  it('긴 값이 들어와도 컬럼 폭으로 잘린다', async () => {
    const create = jest
      .spyOn(LoginHistory, 'create')
      .mockResolvedValue({} as unknown as LoginHistory);

    await loginHistoryService.createLoginRecord({
      userId: 'u'.repeat(300),
      userName: 'n'.repeat(300),
      userRole: 'r'.repeat(300),
      ipAddress: 'i'.repeat(300),
      status: 'failed',
      failureReason: 'f'.repeat(900),
    });

    const saved = create.mock.calls[0][0] as Record<string, string>;
    expect(saved.userId).toHaveLength(50);
    expect(saved.userName).toHaveLength(100);
    expect(saved.userRole).toHaveLength(50);
    expect(saved.ipAddress).toHaveLength(45);
    expect(saved.failureReason).toHaveLength(500);
  });
});

describe('응답 시간으로 계정 존재가 새지 않는다', () => {
  it('없는 계정에도 해시 비교를 한 번 돌린다', async () => {
    // 문구는 실재 계정 오답과 똑같이 맞춰 뒀지만, 비밀번호 비교를 건너뛰면 그 자리가
    // 시간으로 드러난다(실측: 없는 계정 ~0.005s vs 실재 계정 오답 ~0.09s — 15~20배).
    // 시간 자체를 단언하면 기계 사정에 흔들리므로, 비교가 실제로 일어나는지를 고정한다.
    jest.spyOn(securityLogService, 'createLog').mockResolvedValue(undefined);
    jest.spyOn(loginHistoryService, 'createLoginRecord').mockResolvedValue(undefined);
    const compare = jest.spyOn(bcrypt, 'compare');

    const res = await login('__never_existed__', 'whatever12345');

    expect(res.status).toBe(401);
    expect(compare).toHaveBeenCalled();
  });
});
