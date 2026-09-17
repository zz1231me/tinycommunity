// server/src/__tests__/ipWhitelistMiddleware.test.ts
// 관리자 페이지 IP 제한. 잘못 손대면 관리자가 스스로 잠기거나, 반대로 아무나 들어온다.
//
// supertest 요청은 127.0.0.1 에서 오고 미들웨어가 ::ffff: 접두사를 떼므로
// 규칙에 127.0.0.1 을 적으면 '나 자신' 이 된다.

import request from 'supertest';
import { app, seedTestData, loginAs } from './helpers';
import { IpRule } from '../models/IpRule';
import { invalidateIpRuleCache } from '../services/ipRule.service';

let adminCookie = '';
const probe = () => request(app).get('/api/admin/users').set('Cookie', adminCookie);

async function setRules(rules: Array<{ type: 'whitelist' | 'blacklist'; ip: string }>) {
  await IpRule.destroy({ where: {}, force: true });
  for (const r of rules) {
    await IpRule.create({ ...r, description: null, isActive: true, createdBy: 'admin' });
  }
  invalidateIpRuleCache();
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

afterEach(async () => {
  // 규칙이 남으면 다른 스위트의 관리자 요청이 403 으로 깨진다
  await IpRule.destroy({ where: {}, force: true });
  invalidateIpRuleCache();
  delete process.env.ALLOWED_ADMIN_IPS;
});

describe('IP 제한', () => {
  it('규칙이 없으면 통과한다 — 양성 대조', async () => {
    await setRules([]);
    expect((await probe()).status).toBe(200);
  });

  it('블랙리스트에 걸리면 관리자라도 막힌다', async () => {
    await setRules([{ type: 'blacklist', ip: '127.0.0.1' }]);
    const res = await probe();
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('차단된 IP');
  });

  it('화이트리스트가 있고 거기 없으면 막힌다', async () => {
    await setRules([{ type: 'whitelist', ip: '10.0.0.1' }]);
    const res = await probe();
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('허용되지 않은 IP');
  });

  it('화이트리스트에 있으면 통과한다', async () => {
    await setRules([{ type: 'whitelist', ip: '127.0.0.1' }]);
    expect((await probe()).status).toBe(200);
  });

  it('CIDR 로 적어도 통과한다', async () => {
    await setRules([{ type: 'whitelist', ip: '127.0.0.0/8' }]);
    expect((await probe()).status).toBe(200);
  });

  it('블랙리스트가 화이트리스트보다 먼저다', async () => {
    await setRules([
      { type: 'whitelist', ip: '127.0.0.1' },
      { type: 'blacklist', ip: '127.0.0.1' },
    ]);
    const res = await probe();
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('차단된 IP');
  });

  it('비활성 규칙은 세지 않는다', async () => {
    await IpRule.destroy({ where: {}, force: true });
    await IpRule.create({
      type: 'blacklist',
      ip: '127.0.0.1',
      description: null,
      isActive: false,
      createdBy: 'admin',
    });
    invalidateIpRuleCache();
    expect((await probe()).status).toBe(200);
  });

  it('DB 규칙이 없어도 환경변수 화이트리스트가 있으면 그것을 쓴다', async () => {
    await setRules([]);
    process.env.ALLOWED_ADMIN_IPS = '10.0.0.1';
    expect((await probe()).status).toBe(403);
    process.env.ALLOWED_ADMIN_IPS = '10.0.0.1, 127.0.0.1';
    expect((await probe()).status).toBe(200);
  });
});
