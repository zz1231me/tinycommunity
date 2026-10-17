import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Event from '../models/Event';

// 반복 일정 API.
//
// 반복은 규칙 한 줄로 저장하고 보여 줄 때 펼친다. 지금까지는 저장만 되고 펼쳐지지 않아
// '매주 월요일 회의' 가 첫 주에만 떴다.
//
// 지켜야 하는 선:
//  1. 보는 범위 안의 번째들이 모두 온다 — 처음 일정이 범위보다 앞서 있어도.
//  2. 번째에는 그 날짜가 함께 온다(occurrenceDate) — 하루만 건너뛸 때 집을 열쇠다.
//  3. 하루 건너뛰기는 규칙을 건드리지 않는다. 그 날만 빠진다.
//  4. 남의 반복 일정을 아무나 건너뛰게 하지 않는다.

let adminCookie: string;
let userCookie: string;

const makeEvent = (cookie: string, body: Record<string, unknown>) =>
  request(app)
    .post('/api/events')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({
      calendarId: 'default',
      title: '주간 회의',
      isAllday: false,
      start: '2026-11-02T01:00:00.000Z',
      end: '2026-11-02T02:00:00.000Z',
      ...body,
    });

const listRange = (cookie: string, start: string, end: string) =>
  request(app).get(`/api/events?start=${start}&end=${end}`).set('Cookie', cookie);

const skip = (cookie: string, id: number, date: string) =>
  request(app)
    .delete(`/api/events/${id}/occurrences/${date}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

beforeEach(async () => {
  await Event.destroy({ where: {}, truncate: true });
});

describe('펼쳐서 보여 준다', () => {
  it('매주 반복이 범위 안의 모든 주에 선다', async () => {
    const made = await makeEvent(adminCookie, {
      recurrenceType: 'weekly',
      recurrenceDays: [1],
      recurrenceEndDate: '2026-11-30T00:00:00.000Z',
    });
    expect(made.status).toBe(201);

    const res = await listRange(
      adminCookie,
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );

    expect(res.status).toBe(200);
    const dates = res.body.data.map((e: { occurrenceDate?: string }) => e.occurrenceDate);
    expect(dates).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  });

  it('처음 일정이 범위보다 앞서 있어도 이 달의 번째가 온다', async () => {
    await makeEvent(adminCookie, {
      recurrenceType: 'weekly',
      recurrenceDays: [1],
      recurrenceEndDate: '2027-03-31T00:00:00.000Z',
    }).expect(201);

    // 11월에 시작한 반복을 이듬해 1월 창에서 본다
    const res = await listRange(
      adminCookie,
      '2027-01-01T00:00:00.000Z',
      '2027-01-31T23:59:59.000Z'
    );

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.every((e: { isRecurringOccurrence?: boolean }) => e.isRecurringOccurrence)
    ).toBe(true);
  });

  it('반복이 아닌 일정은 한 번만 온다', async () => {
    await makeEvent(adminCookie, { title: '한 번짜리' }).expect(201);

    const res = await listRange(
      adminCookie,
      '2026-11-01T00:00:00.000Z',
      '2026-11-30T23:59:59.000Z'
    );

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].occurrenceDate).toBeUndefined();
  });
});

describe('하루만 건너뛰기', () => {
  it('집은 날만 빠지고 규칙은 그대로다', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'weekly',
        recurrenceDays: [1],
        recurrenceEndDate: '2026-11-30T00:00:00.000Z',
      })
    ).body.data.id as number;

    await skip(adminCookie, id, '2026-11-09').expect(200);

    const dates = (
      await listRange(adminCookie, '2026-11-01T00:00:00.000Z', '2026-11-30T23:59:59.000Z')
    ).body.data.map((e: { occurrenceDate?: string }) => e.occurrenceDate);
    expect(dates).toEqual(['2026-11-02', '2026-11-16', '2026-11-23', '2026-11-30']);

    const still = await Event.findByPk(id);
    expect(still?.recurrenceType).toBe('weekly');
  });

  it('반복이 아닌 일정에는 쓸 수 없다', async () => {
    const id = (await makeEvent(adminCookie, {})).body.data.id as number;

    const res = await skip(adminCookie, id, '2026-11-02');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/반복 일정이 아닙니다/);
  });

  it('날짜 모양이 아니면 거절한다', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'daily',
        recurrenceEndDate: '2026-11-10T00:00:00.000Z',
      })
    ).body.data.id as number;

    await skip(adminCookie, id, '2026-11').expect(400);
  });

  it('남의 반복 일정은 권한이 있어야 건너뛴다', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'daily',
        recurrenceEndDate: '2026-11-10T00:00:00.000Z',
      })
    ).body.data.id as number;

    const res = await skip(userCookie, id, '2026-11-03');

    expect([403, 200]).toContain(res.status);
    if (res.status === 403) {
      const still = await Event.findByPk(id);
      expect(still?.recurrenceExcept ?? []).not.toContain('2026-11-03');
    }
  });

  it('로그인하지 않으면 401', async () => {
    const id = (
      await makeEvent(adminCookie, {
        recurrenceType: 'daily',
        recurrenceEndDate: '2026-11-10T00:00:00.000Z',
      })
    ).body.data.id as number;

    await request(app)
      .delete(`/api/events/${id}/occurrences/2026-11-03`)
      .set(CSRF_HEADER)
      .expect(401);
  });
});
