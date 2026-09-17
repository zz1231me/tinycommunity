import request from 'supertest';
import speakeasy from 'speakeasy';
import jwt from 'jsonwebtoken';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { twoFaVerifyLimiter } from '../routes/twoFactor.routes';
import { User } from '../models/User';
import { decryptSecret } from '../utils/secretCrypto';

// 2FA 는 인증의 마지막 관문이라 분기 하나가 뚫리면 곧바로 계정 탈취로 이어진다.
// 이 스위트는 실제 TOTP 를 생성해 활성화→로그인→비활성화 전 과정을 검증한다.

let userCookie: string;

/** 사용자의 현재 저장된 시크릿으로 유효한 TOTP 를 만든다 */
async function currentTotp(userId: string): Promise<string> {
  const user = await User.findByPk(userId);
  return speakeasy.totp({
    secret: decryptSecret(user!.twoFactorSecret!),
    encoding: 'base32',
  });
}

/** 유효한 코드와 절대 겹치지 않는 잘못된 코드 */
async function wrongTotp(userId: string): Promise<string> {
  const valid = await currentTotp(userId);
  return valid === '000000' ? '111111' : '000000';
}

// generate 는 현재 비밀번호 재확인을 요구한다(시크릿 탈취 방지)
function generateSecret(cookie: string, password = 'TestUser123!') {
  return request(app)
    .post('/api/2fa/generate')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ currentPassword: password });
}

async function enable2fa(cookie: string, userId: string) {
  await generateSecret(cookie);
  return request(app)
    .post('/api/2fa/enable')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ token: await currentTotp(userId) });
}

beforeAll(async () => {
  await seedTestData();
});

// 2FA 설정 변경은 사용자별 5분 10회, 로그인 검증은 IP 기준 5분 5회로 제한된다.
// 테스트는 이 방어를 끄지 않고, 케이스마다 사용자를 새로 만들고(설정 변경 한도 회피)
// IP 기준 카운터만 초기화한다(검증 한도 회피). 제한 로직 자체는 그대로 살아 있다.
let userSeq = 0;
let currentUserId: string;

async function freshUser(): Promise<{ id: string; cookie: string }> {
  const id = `tfa${++userSeq}`;
  await User.destroy({ where: { id }, force: true });
  await User.create({
    id,
    password: 'TestUser123!',
    name: `2FA사용자${userSeq}`,
    email: `${id}@test.com`,
    roleId: 'user',
    isActive: true,
  });
  return { id, cookie: await loginAs(id, 'TestUser123!') };
}

beforeEach(async () => {
  const u = await freshUser();
  currentUserId = u.id;
  userCookie = u.cookie;
  // verify-login 은 IP 기준이라 사용자를 바꿔도 카운터가 공유된다
  for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) {
    await twoFaVerifyLimiter.resetKey(ip);
  }
});

describe('2FA 설정 생성', () => {
  it('시크릿을 발급하되 평문으로 저장하지 않고, 그것만으로 활성화되지는 않는다', async () => {
    const res = await generateSecret(userCookie);
    expect(res.status).toBe(200);

    const user = await User.findByPk(currentUserId);
    expect(user!.twoFactorSecret).toBeTruthy();
    // at-rest 암호화 — 저장값이 복호화 결과와 같으면 평문 저장이다
    expect(user!.twoFactorSecret).not.toBe(decryptSecret(user!.twoFactorSecret!));
    expect(user!.twoFactorEnabled).toBe(false);
  });

  it('미인증 사용자는 생성할 수 없다', async () => {
    const res = await request(app)
      .post('/api/2fa/generate')
      .set(CSRF_HEADER)
      .send({ currentPassword: 'TestUser123!' });
    expect(res.status).toBe(401);
  });

  it('현재 비밀번호가 틀리면 시크릿을 발급하지 않는다', async () => {
    const res = await generateSecret(userCookie, 'WrongPassword123!');
    expect(res.status).toBe(400);

    const user = await User.findByPk(currentUserId);
    expect(user!.twoFactorSecret).toBeNull();
  });

  it('★ 본문 없이 호출해도 500 이 아니라 400 을 준다', async () => {
    // Express 5 는 본문 없는 요청의 req.body 를 undefined 로 둔다 —
    // 정규화가 없으면 구조분해에서 TypeError 가 나 500 이 된다.
    const res = await request(app)
      .post('/api/2fa/generate')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);
    expect(res.status).toBe(400);
  });
});

describe('2FA 활성화', () => {
  it('올바른 TOTP 로 활성화된다', async () => {
    const res = await enable2fa(userCookie, currentUserId);
    expect(res.status).toBe(200);

    const user = await User.findByPk(currentUserId);
    expect(user!.twoFactorEnabled).toBe(true);
  });

  it('잘못된 TOTP 는 거부하고 활성화하지 않는다', async () => {
    await generateSecret(userCookie);
    const res = await request(app)
      .post('/api/2fa/enable')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ token: await wrongTotp(currentUserId) });

    expect(res.status).toBe(400);
    const user = await User.findByPk(currentUserId);
    expect(user!.twoFactorEnabled).toBe(false);
  });

  it('시크릿 생성 없이 활성화하면 거부한다', async () => {
    const res = await request(app)
      .post('/api/2fa/enable')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ token: '123456' });

    expect(res.status).toBe(400);
  });

  it('코드 없이 요청하면 400', async () => {
    await generateSecret(userCookie);
    const res = await request(app)
      .post('/api/2fa/enable')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('2FA 로그인 검증', () => {
  it('2FA 가 켜진 계정은 로그인 시 세션이 아니라 임시 토큰을 받는다', async () => {
    await enable2fa(userCookie, currentUserId);

    const res = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: currentUserId, password: 'TestUser123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.requires2FA).toBe(true);
    expect(res.body.data.tempToken).toBeTruthy();
    // 이 단계에서 access_token 이 내려가면 2FA 를 건너뛸 수 있다
    expect(String(res.headers['set-cookie'] ?? '')).not.toContain('access_token=ey');
  });

  it('올바른 TOTP 로 최종 로그인에 성공한다', async () => {
    await enable2fa(userCookie, currentUserId);
    const login = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: currentUserId, password: 'TestUser123!' });

    const res = await request(app)
      .post('/api/2fa/verify-login')
      .set(CSRF_HEADER)
      .send({ tempToken: login.body.data.tempToken, token: await currentTotp(currentUserId) });

    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toContain('access_token');
  });

  it('잘못된 TOTP 로는 로그인할 수 없다', async () => {
    await enable2fa(userCookie, currentUserId);
    const login = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: currentUserId, password: 'TestUser123!' });

    const res = await request(app)
      .post('/api/2fa/verify-login')
      .set(CSRF_HEADER)
      .send({ tempToken: login.body.data.tempToken, token: await wrongTotp(currentUserId) });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(String(res.headers['set-cookie'] ?? '')).not.toContain('access_token=ey');
  });

  it('★ 일반 액세스 토큰을 tempToken 자리에 넣어 2FA 를 우회할 수 없다', async () => {
    await enable2fa(userCookie, currentUserId);
    // 2FA 를 켜기 전에 받아둔 정상 세션의 access_token 재사용 시도
    const accessToken = userCookie.match(/access_token=([^;]+)/)?.[1];
    expect(accessToken).toBeTruthy();

    const res = await request(app)
      .post('/api/2fa/verify-login')
      .set(CSRF_HEADER)
      .send({ tempToken: accessToken, token: await currentTotp(currentUserId) });

    // type !== '2fa_pending' 이므로 거부돼야 한다
    expect(res.status).toBe(401);
  });

  it('★ 위조 서명된 tempToken 을 거부한다', async () => {
    await enable2fa(userCookie, currentUserId);
    const forged = jwt.sign({ id: currentUserId, type: '2fa_pending' }, 'attacker-secret', {
      algorithm: 'HS256',
    });

    const res = await request(app)
      .post('/api/2fa/verify-login')
      .set(CSRF_HEADER)
      .send({ tempToken: forged, token: await currentTotp(currentUserId) });

    expect(res.status).toBe(401);
  });

  it('★ 만료된 tempToken 을 거부한다', async () => {
    await enable2fa(userCookie, currentUserId);
    const expired = jwt.sign(
      { id: currentUserId, type: '2fa_pending' },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );

    const res = await request(app)
      .post('/api/2fa/verify-login')
      .set(CSRF_HEADER)
      .send({ tempToken: expired, token: await currentTotp(currentUserId) });

    expect(res.status).toBe(401);
  });

  it('필수 항목이 빠지면 400', async () => {
    const res = await request(app).post('/api/2fa/verify-login').set(CSRF_HEADER).send({});
    expect(res.status).toBe(400);
  });
});

describe('2FA 비활성화', () => {
  it('비밀번호와 TOTP 가 모두 맞아야 해제되고 시크릿도 폐기된다', async () => {
    await enable2fa(userCookie, currentUserId);

    const res = await request(app)
      .post('/api/2fa/disable')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ currentPassword: 'TestUser123!', token: await currentTotp(currentUserId) });

    expect(res.status).toBe(200);
    const user = await User.findByPk(currentUserId);
    expect(user!.twoFactorEnabled).toBe(false);
    expect(user!.twoFactorSecret).toBeNull();
  });

  it('★ 비밀번호가 틀리면 TOTP 가 맞아도 해제되지 않는다', async () => {
    await enable2fa(userCookie, currentUserId);

    const res = await request(app)
      .post('/api/2fa/disable')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ currentPassword: 'WrongPassword123!', token: await currentTotp(currentUserId) });

    expect(res.status).toBe(400);
    const user = await User.findByPk(currentUserId);
    expect(user!.twoFactorEnabled).toBe(true);
  });

  it('★ TOTP 가 틀리면 비밀번호가 맞아도 해제되지 않는다', async () => {
    await enable2fa(userCookie, currentUserId);

    const res = await request(app)
      .post('/api/2fa/disable')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ currentPassword: 'TestUser123!', token: await wrongTotp(currentUserId) });

    expect(res.status).toBe(400);
    const user = await User.findByPk(currentUserId);
    expect(user!.twoFactorEnabled).toBe(true);
  });

  it('2FA 가 꺼져 있으면 해제 요청을 거부한다', async () => {
    const res = await request(app)
      .post('/api/2fa/disable')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ currentPassword: 'TestUser123!', token: '123456' });

    expect(res.status).toBe(400);
  });
});

describe('2FA 상태 조회', () => {
  it('활성화 여부를 반영한다', async () => {
    const before = await request(app).get('/api/2fa/status').set('Cookie', userCookie);
    expect(before.status).toBe(200);
    expect(before.body.data.enabled).toBe(false);

    await enable2fa(userCookie, currentUserId);

    const after = await request(app).get('/api/2fa/status').set('Cookie', userCookie);
    expect(after.body.data.enabled).toBe(true);
  });

  it('미인증은 401', async () => {
    const res = await request(app).get('/api/2fa/status');
    expect(res.status).toBe(401);
  });
});
