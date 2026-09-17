// server/src/__tests__/eventPermissionMiddleware.test.ts
// 일정 권한 판정. 커버리지 15% 구간이라 분기를 직접 짚는다.
//
// 라우트에는 create·read 만 걸려 있어 HTTP 로는 두 갈래밖에 못 지난다.
// 나머지(update·delete·역할 비활성·알 수 없는 동작)는 미들웨어를 직접 불러 덮는다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { checkEventPermission } from '../middlewares/eventPermission.middleware';
import { User } from '../models/User';
import { Role } from '../models/Role';
import EventPermission from '../models/EventPermission';
import Event from '../models/Event';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import type { Request, Response } from 'express';

const PASSWORD = 'TestUser123!';
let userCookie = '';
let adminCookie = '';

/** sendForbidden 등은 res.status().json() 을 부른다 — 그것만 흉내 낸다 */
function mockRes() {
  const res = { statusCode: 0, body: null as unknown };
  const self = res as unknown as Response & typeof res;
  (self as unknown as { status: (c: number) => unknown }).status = (c: number) => {
    res.statusCode = c;
    return self;
  };
  (self as unknown as { json: (b: unknown) => unknown }).json = (b: unknown) => {
    res.body = b;
    return self;
  };
  return self;
}

const reqWithRole = (role?: string) =>
  ({ user: role ? { id: 'x', role } : undefined }) as unknown as Request;

async function run(action: 'create' | 'read' | 'update' | 'delete', role?: string) {
  const res = mockRes();
  let passed = false;
  await checkEventPermission(action)(reqWithRole(role), res, () => {
    passed = true;
  });
  return {
    passed,
    status: (res as unknown as { statusCode: number }).statusCode,
    body: (res as unknown as { body: { message?: string } }).body,
  };
}

const eventBody = {
  calendarId: 'default',
  title: '권한 테스트 일정',
  start: '2026-06-01T09:00:00.000Z',
  end: '2026-06-01T10:00:00.000Z',
  isAllday: false,
};

async function setPermission(
  roleId: string,
  patch: Partial<{ canCreate: boolean; canRead: boolean; canUpdate: boolean; canDelete: boolean }>
) {
  await EventPermission.destroy({ where: { roleId } });
  await EventPermission.create({
    roleId,
    canCreate: false,
    canRead: true,
    canUpdate: false,
    canDelete: false,
    ...patch,
  });
}

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'tools.calendar' } });
  await FeatureFlag.create({ key: 'tools.calendar', enabled: true });
  featureFlagService.invalidate();

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  if (!(await User.findByPk('evtperm'))) {
    await User.create({
      id: 'evtperm',
      password: PASSWORD,
      name: '일정권한',
      email: 'evtperm@test.com',
      roleId: 'user',
      isActive: true,
    });
  }
  const res = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ id: 'evtperm', password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  userCookie = list.map(c => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await EventPermission.destroy({ where: { roleId: 'user' } });
  await Event.destroy({ where: { UserId: 'evtperm' }, force: true });
});

describe('미들웨어 자체', () => {
  it('로그인하지 않았으면 401', async () => {
    const r = await run('create');
    expect(r.passed).toBe(false);
    expect(r.status).toBe(401);
  });

  it('관리자는 어떤 동작이든 통과한다', async () => {
    for (const a of ['create', 'read', 'update', 'delete'] as const) {
      expect((await run(a, 'admin')).passed).toBe(true);
    }
  });

  it('없는 역할이면 403', async () => {
    const r = await run('read', 'no-such-role');
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('역할이 비활성이면 403', async () => {
    await Role.update({ isActive: false }, { where: { id: 'user' } });
    try {
      const r = await run('read', 'user');
      expect(r.passed).toBe(false);
      expect(r.status).toBe(403);
      expect((r.body as { message?: string })?.message).toContain('유효하지 않은');
    } finally {
      await Role.update({ isActive: true }, { where: { id: 'user' } });
    }
  });

  it('권한 설정이 없으면 조회만 통과하고 나머지는 403', async () => {
    await EventPermission.destroy({ where: { roleId: 'user' } });
    expect((await run('read', 'user')).passed).toBe(true);
    for (const a of ['create', 'update', 'delete'] as const) {
      const r = await run(a, 'user');
      expect(r.passed).toBe(false);
      expect(r.status).toBe(403);
    }
  });

  it('설정된 값을 동작별로 그대로 따른다', async () => {
    await setPermission('user', {
      canCreate: true,
      canRead: false,
      canUpdate: true,
      canDelete: false,
    });
    expect((await run('create', 'user')).passed).toBe(true);
    expect((await run('update', 'user')).passed).toBe(true);
    expect((await run('read', 'user')).passed).toBe(false);
    expect((await run('delete', 'user')).passed).toBe(false);
  });
});

describe('라우트에 실제로 걸려 있는가', () => {
  it('생성 권한이 없으면 일정이 만들어지지 않는다', async () => {
    await setPermission('user', { canCreate: false });
    const before = await Event.count({ where: { UserId: 'evtperm' } });
    const res = await request(app)
      .post('/api/events')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send(eventBody);
    expect(res.status).toBe(403);
    expect(await Event.count({ where: { UserId: 'evtperm' } })).toBe(before);
  });

  it('생성 권한이 있으면 실제로 만들어진다 — 양성 대조', async () => {
    await setPermission('user', { canCreate: true });
    const res = await request(app)
      .post('/api/events')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send(eventBody);
    expect([200, 201]).toContain(res.status);
    expect(await Event.count({ where: { UserId: 'evtperm' } })).toBeGreaterThan(0);
  });

  it('조회 권한을 끄면 목록도 막힌다', async () => {
    await setPermission('user', { canRead: false });
    const res = await request(app).get('/api/events').set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  it('관리자는 권한 설정과 무관하게 조회된다', async () => {
    await setPermission('user', { canRead: false });
    const res = await request(app).get('/api/events').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });
});
