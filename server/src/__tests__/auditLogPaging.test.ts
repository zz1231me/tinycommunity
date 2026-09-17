import request from 'supertest';
import { app, seedTestData, loginAs } from './helpers';

// 감사 로그 목록의 페이지 상한.
//
// page 에 위쪽 상한이 없으면 요청 하나로 거대한 OFFSET 스캔과 COUNT(*) 가 함께 돈다.
// 형제들은 모두 막아 두었다 — utils/pagination 은 maxPage 1000, loginHistory 는 10000.
// 감사 로그만 빠져 있었다.
//
// 관리자만 부를 수 있는 화면이라 외부 공격은 아니지만, 손이 미끄러진 한 번으로
// DB 가 한참 묶인다.

let adminCookie: string;

const logs = (query: string) =>
  request(app).get(`/api/admin/audit-logs${query}`).set('Cookie', adminCookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

describe('감사 로그 페이지 범위', () => {
  it('터무니없이 큰 page 는 상한으로 깎인다', async () => {
    const res = await logs('?page=99999999');
    expect(res.status).toBe(200);
    // 고치기 전에는 받은 값을 그대로 되돌려 주며 그 offset 으로 조회했다
    expect(res.body.data.currentPage).toBe(1000);
  });

  it('평범한 page 는 그대로 쓴다 — 전부 1000 으로 밀어 버리면 안 된다', async () => {
    const res = await logs('?page=2');
    expect(res.status).toBe(200);
    expect(res.body.data.currentPage).toBe(2);
  });

  it('0 이나 음수는 첫 페이지로 본다', async () => {
    expect((await logs('?page=0')).body.data.currentPage).toBe(1);
    expect((await logs('?page=-5')).body.data.currentPage).toBe(1);
  });

  it('page 를 안 주면 첫 페이지다', async () => {
    const res = await logs('');
    expect(res.status).toBe(200);
    expect(res.body.data.currentPage).toBe(1);
  });

  it('limit 도 위쪽이 막혀 있다', async () => {
    const res = await logs('?limit=100000');
    expect(res.status).toBe(200);
    // limit 은 100 이 상한이라, 한 번에 그 이상은 나오지 않는다
    expect(res.body.data.logs.length).toBeLessThanOrEqual(100);
  });
});
