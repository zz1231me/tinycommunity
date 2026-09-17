// server/src/__tests__/ipWhitelistFallback.test.ts
// DB 규칙을 읽지 못할 때의 관리자 IP 제한.
//
// 읽기에 실패하면 미들웨어는 환경변수 화이트리스트로 물러선다. 이 길이 잘못되면
// DB 장애를 틈타 관리자 페이지가 모든 IP 에 열린다 — 조용히 일어나는 종류의 사고다.
//
// 헛통과를 막기 위해 DB 규칙과 환경변수가 서로 반대를 말하게 둔다. 그래야 폴백이
// 실제로 탔을 때만 통과한다. (처음에는 둘이 같은 말을 하도록 써서, 폴백을 한 번도
// 지나지 않고도 네 검사가 모두 통과했다 — 커버리지에 그 구간이 미커버로 남아 드러났다.)

import request from 'supertest';
import { app, seedTestData, loginAs } from './helpers';
import { IpRule } from '../models/IpRule';
import * as ipRuleService from '../services/ipRule.service';

let adminCookie = '';
const probe = () => request(app).get('/api/admin/users').set('Cookie', adminCookie);

/** getIpRuleCache 만 실패시킨다(모듈 객체의 속성을 가로챈다) */
function breakDb() {
  return jest.spyOn(ipRuleService, 'getIpRuleCache').mockRejectedValue(new Error('DB 장애'));
}

async function addRule(type: 'whitelist' | 'blacklist', ip: string) {
  await IpRule.create({ type, ip, description: null, isActive: true, createdBy: 'admin' });
  ipRuleService.invalidateIpRuleCache();
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

afterEach(async () => {
  jest.restoreAllMocks();
  await IpRule.destroy({ where: {}, force: true });
  ipRuleService.invalidateIpRuleCache();
  delete process.env.ALLOWED_ADMIN_IPS;
});

describe('규칙을 읽지 못할 때', () => {
  it('DB 를 읽었다면 통과했을 요청도, 읽지 못하면 환경변수 기준으로 막힌다', async () => {
    // DB 는 내 IP 를 허용한다고 말하지만, 환경변수는 다른 IP 만 허용한다
    await addRule('whitelist', '127.0.0.1');
    process.env.ALLOWED_ADMIN_IPS = '10.0.0.1';

    const spy = breakDb();
    const res = await probe();
    expect(spy).toHaveBeenCalled(); // 폴백 경로를 실제로 지났다
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('허용되지 않은 IP');
  });

  it('DB 가 차단하던 IP 도, 읽지 못하면 환경변수가 허용하면 통과한다', async () => {
    // 반대 방향 — 정상 경로였다면 403 이어야 하는 요청
    await addRule('blacklist', '127.0.0.1');
    process.env.ALLOWED_ADMIN_IPS = '127.0.0.1';

    const spy = breakDb();
    const res = await probe();
    expect(spy).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('환경변수가 비어 있으면 통과시킨다 — 개발 환경이 잠기지 않도록', async () => {
    await addRule('blacklist', '127.0.0.1'); // 정상 경로였다면 403
    delete process.env.ALLOWED_ADMIN_IPS;

    const spy = breakDb();
    const res = await probe();
    expect(spy).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('환경변수에 CIDR 로 적어도 통과한다', async () => {
    await addRule('blacklist', '127.0.0.1'); // 정상 경로였다면 403
    process.env.ALLOWED_ADMIN_IPS = '127.0.0.0/8';

    const spy = breakDb();
    const res = await probe();
    expect(spy).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
