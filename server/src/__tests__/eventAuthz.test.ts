// server/src/__tests__/eventAuthz.test.ts
// 남의 일정을 고치거나 지울 수 있는지.
//
// 이벤트의 수정·삭제 라우트에는 checkEventPermission 이 일부러 빠져 있다
// (붙이면 소유자가 자기 일정을 못 고친다). 대신 컨트롤러가 isOwner || isAdmin 을
// 확인한다. 그 판정이 event.controller 커버리지 8% 구간에 있어, 지금 맞더라도
// 누가 건드리면 조용히 깨진다 — 여기서 고정한다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import Event from '../models/Event';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

const PASSWORD = 'TestUser123!';
let ownerCookie = '';
let otherCookie = '';
let adminCookie = '';

async function makeUser(id: string, name: string) {
  if (!(await User.findByPk(id))) {
    await User.create({
      id,
      password: PASSWORD,
      name,
      email: `${id}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
  const res = await request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ id, password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers['set-cookie'];
  const list: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map(c => c.split(';')[0]).join('; ');
}

async function makeEvent(userId: string, title: string) {
  return Event.create({
    calendarId: 'default',
    title,
    isAllday: false,
    start: new Date('2026-05-01T09:00:00.000Z'),
    end: new Date('2026-05-01T10:00:00.000Z'),
    isReadOnly: false,
    UserId: userId,
  });
}

const body = {
  title: '바뀐 제목',
  start: '2026-05-01T09:00:00.000Z',
  end: '2026-05-01T11:00:00.000Z',
  isAllday: false,
};

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'tools.calendar' } });
  await FeatureFlag.create({ key: 'tools.calendar', enabled: true });
  featureFlagService.invalidate();

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  ownerCookie = await makeUser('evt-owner', '주인');
  otherCookie = await makeUser('evt-other', '남');
});

describe('남의 일정', () => {
  it('소유자는 자기 일정을 고칠 수 있다 — 양성 대조', async () => {
    const ev = await makeEvent('evt-owner', '원래 제목');
    const res = await request(app)
      .put(`/api/events/${ev.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', ownerCookie)
      .send(body);
    expect(res.status).toBe(200);
  });

  it('남은 고칠 수 없고, 제목도 그대로다', async () => {
    const ev = await makeEvent('evt-owner', '건드리면 안 되는 제목');
    const res = await request(app)
      .put(`/api/events/${ev.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', otherCookie)
      .send(body);
    expect(res.status).toBe(403);
    const after = await Event.findByPk(ev.id);
    expect(after?.title).toBe('건드리면 안 되는 제목');
  });

  it('남은 지울 수 없고, 일정도 남아 있다', async () => {
    const ev = await makeEvent('evt-owner', '지우면 안 되는 일정');
    const res = await request(app)
      .delete(`/api/events/${ev.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', otherCookie);
    expect(res.status).toBe(403);
    expect(await Event.findByPk(ev.id)).not.toBeNull();
  });

  it('로그인하지 않으면 손댈 수 없다', async () => {
    const ev = await makeEvent('evt-owner', '비로그인 차단');
    const res = await request(app).put(`/api/events/${ev.id}`).set(CSRF_HEADER).send(body);
    expect(res.status).not.toBe(200);
    expect((await Event.findByPk(ev.id))?.title).toBe('비로그인 차단');
  });

  it('관리자는 남의 일정도 고칠 수 있다 — 의도된 예외', async () => {
    const ev = await makeEvent('evt-owner', '관리자가 고칠 것');
    const res = await request(app)
      .put(`/api/events/${ev.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send(body);
    expect(res.status).toBe(200);
  });
});
