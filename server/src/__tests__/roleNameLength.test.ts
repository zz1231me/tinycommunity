// 역할 이름은 컬럼이 50자다. 넘는 값을 그대로 넣으면 DB 오류가 500 으로 나간다.
// 사용자가 잘못 입력한 것이므로 400 으로 알려 줘야 한다(수정 쪽은 이미 그렇게 한다).

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';

let adminCookie: string;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

const createRole = (name: string) =>
  request(app)
    .post('/api/admin/roles')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ id: `len-${Date.now()}`, name, description: '' });

describe('역할 만들기', () => {
  it('이름이 50자를 넘으면 400 으로 알려 준다', async () => {
    const res = await createRole('가'.repeat(51));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('50자');
  });

  it('50자까지는 만들어진다 — 대조군', async () => {
    const res = await createRole('나'.repeat(50));
    expect(res.status).toBe(201);
  });
});
