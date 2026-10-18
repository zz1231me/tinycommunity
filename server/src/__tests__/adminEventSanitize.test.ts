import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Event from '../models/Event';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

// 관리자 화면으로 고친 일정 본문의 정화.
//
// 사용자 경로(event.controller)는 만들 때도 고칠 때도 본문을 sanitizeHtmlContent 로
// 지나게 하는데, 관리자 화면이 쓰는 경로만 빠져 있었다. 관리자가 넣은 HTML 이 그대로
// 저장되어, 그 일정을 보는 모든 사람의 화면에서 실행된다.
//
// 화면 쪽 DOMPurify 는 방어가 아니다 — 요청은 화면을 거치지 않고도 보낼 수 있다.

let adminCookie: string;

async function makeEvent(title: string) {
  return Event.create({
    calendarId: 'default',
    title,
    isAllday: false,
    start: new Date('2026-05-01T09:00:00.000Z'),
    end: new Date('2026-05-01T10:00:00.000Z'),
    isReadOnly: false,
    UserId: 'admin',
  });
}

const update = (id: number, body: string) =>
  request(app).put(`/api/admin/events/${id}`).set(CSRF_HEADER).set('Cookie', adminCookie).send({
    title: '정화 확인',
    start: '2026-05-01T09:00:00.000Z',
    end: '2026-05-01T10:00:00.000Z',
    body,
  });

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'tools.calendar' } });
  await FeatureFlag.create({ key: 'tools.calendar', enabled: true });
  featureFlagService.invalidate();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

describe('관리자가 고친 일정 본문도 정화한다', () => {
  it('script 태그는 저장되지 않는다', async () => {
    const ev = await makeEvent(`정화 ${Date.now()}`);
    const res = await update(ev.id, '<p>남는 글</p><script>alert(1)</script>');
    expect(res.status).toBe(200);

    const saved = await Event.findByPk(ev.id);
    expect(saved?.body ?? '').not.toContain('<script');
  });

  it('이벤트 핸들러 속성도 남지 않는다', async () => {
    const ev = await makeEvent(`정화속성 ${Date.now()}`);
    const res = await update(ev.id, '<img src="x" onerror="alert(1)">');
    expect(res.status).toBe(200);

    const saved = await Event.findByPk(ev.id);
    expect(saved?.body ?? '').not.toContain('onerror');
  });

  it('멀쩡한 본문은 그대로 남는다 — 양성 대조', async () => {
    // 이것이 없으면 '본문을 통째로 비우는' 구현도 위 테스트들을 통과한다
    const ev = await makeEvent(`정화보존 ${Date.now()}`);
    const res = await update(ev.id, '<p>회의는 3층에서 합니다</p>');
    expect(res.status).toBe(200);

    const saved = await Event.findByPk(ev.id);
    expect(saved?.body ?? '').toContain('회의는 3층에서 합니다');
  });
});

// 사용자 경로(POST/PUT /api/events)의 정화는 위 관리자 경로와 따로다.
// 본문을 씻는 자리를 컨트롤러에서 서비스로 옮기면서 재어 보니, 씻는 줄을 통째로
// 지워도 기존 43개가 모두 초록이었다 — 그물에 구멍이 있었다.
describe('사용자가 만들거나 고친 일정 본문도 정화한다', () => {
  const create = (body: string) =>
    request(app).post('/api/events').set(CSRF_HEADER).set('Cookie', adminCookie).send({
      calendarId: 'default',
      title: '사용자 경로 정화',
      start: '2026-05-01T09:00:00.000Z',
      end: '2026-05-01T10:00:00.000Z',
      isAllday: false,
      body,
    });

  it('만들 때 script 태그는 저장되지 않는다', async () => {
    const res = await create('<p>남는 글</p><script>alert(1)</script>');
    expect(res.status).toBe(201);

    const saved = await Event.findByPk((res.body.data as { id: number }).id);
    expect(saved?.body ?? '').not.toContain('<script');
    // 통째로 비우는 구현도 막는다
    expect(saved?.body ?? '').toContain('남는 글');
  });

  it('고칠 때도 script 태그는 저장되지 않는다', async () => {
    const created = await create('<p>처음</p>');
    const id = (created.body.data as { id: number }).id;

    const res = await request(app)
      .put(`/api/events/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '사용자 경로 정화',
        start: '2026-05-01T09:00:00.000Z',
        end: '2026-05-01T10:00:00.000Z',
        isAllday: false,
        body: '<p>고친 글</p><img src="x" onerror="alert(1)">',
      });
    expect(res.status).toBe(200);

    const saved = await Event.findByPk(id);
    expect(saved?.body ?? '').not.toContain('onerror');
    expect(saved?.body ?? '').toContain('고친 글');
  });
});
