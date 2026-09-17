// server/src/__tests__/columnBounds.test.ts
// 검증 상한이 DB 컬럼 용량과 맞는지 — 남아 있던 네 곳.
//
// SQLite 는 VARCHAR 길이를 강제하지 않아 개발에서는 그대로 저장된다(실측했다).
// MySQL/MariaDB/PostgreSQL 에서는 오류가 된다. 컨트롤러에서 400 으로 알리고,
// 컨트롤러를 우회해도 모델 검증기가 막는다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Bookmark } from '../models/Bookmark';
import { CustomPage } from '../models/CustomPage';
import { Report } from '../models/Report';

let adminCookie = '';

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

describe('모델이 컬럼 용량을 넘기지 않는다', () => {
  it('Bookmark.url 500자 초과', async () => {
    await expect(
      Bookmark.create({
        name: 'x',
        url: 'https://e.com/' + 'u'.repeat(600),
        icon: null,
        order: 8001,
      } as never)
    ).rejects.toThrow();
  });

  it('Bookmark.icon 500자 초과', async () => {
    await expect(
      Bookmark.create({
        name: 'x',
        url: 'https://e.com',
        icon: 'i'.repeat(600),
        order: 8002,
      } as never)
    ).rejects.toThrow();
  });

  it('CustomPage.title 150자 초과', async () => {
    await expect(
      CustomPage.create({
        slug: `cb-${Date.now()}`,
        title: 't'.repeat(151),
        html: '<p>x</p>',
        createdBy: 'admin',
      } as never)
    ).rejects.toThrow();
  });

  it('Report.reviewNote 500자 초과', async () => {
    await expect(
      Report.create({
        targetType: 'post',
        targetId: 'p1',
        reporterId: 'admin',
        reason: 'spam',
        reviewNote: 'r'.repeat(501),
        status: 'reviewed',
      } as never)
    ).rejects.toThrow();
  });

  it('경계값은 받는다 — 양성 대조', async () => {
    const b = await Bookmark.create({
      name: 'x',
      url: 'https://e.com/' + 'u'.repeat(486),
      icon: 'i'.repeat(500),
      order: 8003,
    } as never);
    expect(b.url.length).toBe(500);
    await b.destroy({ force: true });

    const c = await CustomPage.create({
      slug: `cb-ok-${Date.now()}`,
      title: 't'.repeat(150),
      html: '<p>x</p>',
      createdBy: 'admin',
    } as never);
    expect(c.id).toBeTruthy();
    await c.destroy({ force: true });
  });
});

describe('북마크 API — 500 이 아니라 400', () => {
  it('URL 이 너무 길면 400 으로 알린다', async () => {
    const res = await request(app)
      .post('/api/bookmarks')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: '탐침', url: 'https://example.com/' + 'u'.repeat(600) });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('500자');
  });

  it('정상 북마크는 등록된다 — 경로 오류로 통과한 것이 아님을 보인다', async () => {
    const res = await request(app)
      .post('/api/bookmarks')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: '정상 북마크', url: 'https://example.com/ok' });
    expect([200, 201]).toContain(res.status);
    const id = res.body?.data?.id;
    if (id) await Bookmark.destroy({ where: { id }, force: true });
  });
});
