// server/src/__tests__/passwordLength.test.ts
// bcrypt 가 조용히 버리는 72바이트 뒤.
//
// 막지 않으면 뒤쪽을 아무렇게나 바꿔도 같은 비밀번호가 되고, 앞 72바이트만 아는
// 사람이 그대로 로그인한다. 실제로 100자로 가입한 계정이 앞 72자만으로 로그인됐다.
// 한글은 UTF-8 로 3바이트라 24자면 상한이다 — 글자 수가 아니라 바이트로 세야 한다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { AuthValidator } from '../validators/auth.validator';
import { User } from '../models/User';

beforeAll(async () => {
  await seedTestData();
});

describe('비밀번호 길이 상한', () => {
  it('72바이트까지는 받는다', () => {
    const pw = 'Aa1!' + 'x'.repeat(68); // 정확히 72바이트
    expect(Buffer.byteLength(pw)).toBe(72);
    expect(AuthValidator.validatePassword(pw, true).valid).toBe(true);
  });

  it('73바이트부터는 거부한다', () => {
    const pw = 'Aa1!' + 'x'.repeat(69);
    expect(Buffer.byteLength(pw)).toBe(73);
    expect(AuthValidator.validatePassword(pw, true).valid).toBe(false);
  });

  it('한글은 글자 수가 아니라 바이트로 센다 — 24자까지', () => {
    const ok = 'Aa1!' + '가'.repeat(22); // 4 + 66 = 70바이트
    const tooLong = 'Aa1!' + '가'.repeat(24); // 4 + 72 = 76바이트
    expect(Buffer.byteLength(tooLong)).toBeGreaterThan(72);
    expect(AuthValidator.validatePassword(ok, true).valid).toBe(true);
    expect(AuthValidator.validatePassword(tooLong, true).valid).toBe(false);
  });

  it('가입에서 막힌다 — 앞 72바이트만으로 로그인되는 계정이 만들어지지 않는다', async () => {
    await User.destroy({ where: { id: 'pwlen01' }, force: true });
    const pw = 'Aa1!' + 'q'.repeat(96); // 100자
    const res = await request(app)
      .post('/api/auth/register')
      .set(CSRF_HEADER)
      .send({ id: 'pwlen01', password: pw, name: '길이' });
    expect(res.status).toBe(400);
    expect(await User.findByPk('pwlen01')).toBeNull();
  });

  it('정상 길이 비밀번호는 가입도 로그인도 된다 — 양성 대조', async () => {
    await User.destroy({ where: { id: 'pwlen02' }, force: true });
    const pw = 'Aa1!normal-password';
    const reg = await request(app)
      .post('/api/auth/register')
      .set(CSRF_HEADER)
      .send({ id: 'pwlen02', password: pw, name: '정상' });
    expect([200, 201]).toContain(reg.status);
    const login = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ id: 'pwlen02', password: pw });
    expect(login.status).toBe(200);
  });
});

describe('관리자 사용자 생성 — 검증한 값과 저장하는 값', () => {
  it('앞뒤 공백이 붙은 이름도 500 이 아니라 정상 생성된다', async () => {
    const adminCookie = await loginAs('admin', 'TestAdmin123!');
    await User.destroy({ where: { id: 'trimprobe' }, force: true });
    const res = await request(app)
      .post('/api/admin/users')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        id: 'trimprobe',
        password: 'TestUser123!',
        name: 'n'.repeat(45) + ' '.repeat(10),
        roleId: 'user',
      });
    expect(res.status).not.toBe(500);
    expect([200, 201]).toContain(res.status);
    // 검증은 trim 기준이었으므로 저장도 trim 된 값이어야 한다
    expect((await User.findByPk('trimprobe'))?.name).toBe('n'.repeat(45));
  });
});
