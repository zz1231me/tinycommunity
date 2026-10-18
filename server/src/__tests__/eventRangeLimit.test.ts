// 달력 조회 범위의 상한.
//
// /api/events 는 반복 일정을 그 자리에서 펼쳐 돌려준다. 범위를 주지 않으면 1970년부터
// 2100년까지를 펼쳤다 — 2020년부터 2030년까지 매일 도는 일정(화면에서 만들 수 있는
// 값이다) 하나가 500번째까지 꽉 차고, 그런 일정 200개면 한 번의 요청이 수만 개의
// 객체를 만든다. 객체마다 본문이 통째로 복사되므로 메모리가 거기에 비례한다.
//
// 재어 보니 본문 2천 자짜리 반복 일정 30건으로 한 번의 응답이 12.7MB 였다.
// 로그인한 사람이면 누구나 반복해서 부를 수 있다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Event from '../models/Event';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

let adminCookie: string;

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'tools.calendar' } });
  await FeatureFlag.create({ key: 'tools.calendar', enabled: true });
  featureFlagService.invalidate();
  adminCookie = await loginAs('admin', 'TestAdmin123!');

  // 화면에서 만들 수 있는 값이다 — 반복 종료일이 있고, 시작보다 뒤다.
  const res = await request(app)
    .post('/api/events')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({
      calendarId: 'default',
      title: '오래 도는 일정',
      start: '2020-01-01T09:00:00.000Z',
      end: '2020-01-01T10:00:00.000Z',
      isAllday: false,
      recurrenceType: 'daily',
      recurrenceInterval: 1,
      recurrenceEndDate: '2030-01-01T00:00:00.000Z',
    });
  expect(res.status).toBe(201);
});

afterAll(async () => {
  await Event.destroy({ where: { title: '오래 도는 일정' }, force: true });
});

const list = (query = '') => request(app).get(`/api/events${query}`).set('Cookie', adminCookie);

describe('조회 범위', () => {
  it('범위를 주지 않아도 먼 과거까지 펼치지 않는다', async () => {
    const res = await list();
    expect(res.status).toBe(200);

    const rows = res.body.data as Array<{ start: string }>;
    const oldest = rows
      .map(r => new Date(r.start).getTime())
      .reduce((a, b) => Math.min(a, b), Infinity);

    // 기본 창은 오늘 언저리다. 5년 전 일정이 끼어 있으면 창이 없는 것이다.
    const fiveYearsAgo = Date.now() - 5 * 365 * 24 * 60 * 60 * 1000;
    expect(oldest).toBeGreaterThan(fiveYearsAgo);
  });

  it('지나치게 넓은 범위는 400 으로 거절한다', async () => {
    const res = await list('?start=1970-01-01T00:00:00.000Z&end=2100-01-01T00:00:00.000Z');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('범위');
  });

  it('화면이 보내는 범위는 그대로 통한다 — 양성 대조', async () => {
    // 달력이 한 번에 묻는 가장 넓은 창이 100일이다
    const res = await list('?start=2025-01-01T00:00:00.000Z&end=2025-02-01T00:00:00.000Z');
    expect(res.status).toBe(200);

    const rows = res.body.data as Array<{ title: string }>;
    // 1월 1일부터 2월 1일 0시까지 — 2월 1일 09시의 번째는 창 밖이라 31개다
    expect(rows.filter(r => r.title === '오래 도는 일정').length).toBe(31);
  });
});
