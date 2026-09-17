// server/src/__tests__/titleLengthBounds.test.ts
// 제목 길이 설정이 컬럼 용량을 넘지 못하게.
//
// postTitleMaxLength 하나가 컬럼 셋을 지배한다 — Post.title(255),
// PostDraft.title(255), WikiPage.title(200). 그런데 설정 허용 범위가 500 이라
// 관리자가 올리면 검증을 통과한 제목이 컬럼을 넘어 내려갔다. SQLite 는 길이를
// 강제하지 않아 그대로 저장됐고(실측), MySQL/PG 에서는 오류가 된다.
// 보호 장치가 없던 세 컬럼에 검증기를 넣고, 설정은 읽을 때도 자른다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { SiteSettings } from '../models/SiteSettings';
import { refreshSettingsCache, getPostTitleMaxLength } from '../utils/settingsCache';
import { WikiPage } from '../models/WikiPage';
import { PostDraft } from '../models/PostDraft';
import { Announcement } from '../models/Announcement';

let adminCookie = '';

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

afterAll(async () => {
  await SiteSettings.update({ postTitleMaxLength: 200 }, { where: {} });
  await refreshSettingsCache();
});

describe('설정 상한', () => {
  it('저장된 값이 커도 읽을 때 200 을 넘지 않는다', async () => {
    await SiteSettings.update({ postTitleMaxLength: 400 }, { where: {} });
    await refreshSettingsCache();
    expect(getPostTitleMaxLength()).toBe(200);
  });

  it('정상 범위 값은 그대로 쓴다 — 양성 대조', async () => {
    await SiteSettings.update({ postTitleMaxLength: 120 }, { where: {} });
    await refreshSettingsCache();
    expect(getPostTitleMaxLength()).toBe(120);
  });
});

describe('컬럼을 넘는 제목은 저장되지 않는다', () => {
  it('위키 제목 200자 초과', async () => {
    await expect(
      WikiPage.create({
        slug: `bound-${Date.now()}`,
        title: 'a'.repeat(201),
        content: '',
        authorId: 'admin',
        lastEditorId: 'admin',
        isPublished: true,
      } as never)
    ).rejects.toThrow();
  });

  it('임시보관 제목 255자 초과', async () => {
    await expect(
      PostDraft.create({
        UserId: 'admin',
        boardType: 'notice',
        title: 'b'.repeat(256),
        content: '',
      } as never)
    ).rejects.toThrow();
  });

  it('공지 제목 200자 초과', async () => {
    await expect(
      Announcement.create({ title: 'c'.repeat(201), content: '', createdBy: 'admin' } as never)
    ).rejects.toThrow();
  });

  it('경계값은 받는다 — 양성 대조', async () => {
    const w = await WikiPage.create({
      slug: `bound-ok-${Date.now()}`,
      title: 'a'.repeat(200),
      content: '',
      authorId: 'admin',
      lastEditorId: 'admin',
      isPublished: true,
    } as never);
    expect(w.id).toBeTruthy();
    await w.destroy({ force: true });

    const d = await PostDraft.create({
      UserId: 'admin',
      boardType: 'notice',
      title: 'b'.repeat(255),
      content: '',
    } as never);
    expect(d.id).toBeTruthy();
    await d.destroy({ force: true });
  });
});

describe('공지 API — 500 이 아니라 400', () => {
  it('제목이 너무 길면 400 으로 알린다', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: 'z'.repeat(300), content: '본문' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('200자');
  });

  it('정상 제목은 등록된다 — 위 검사가 경로 오류로 통과한 것이 아님을 보인다', async () => {
    const res = await request(app)
      .post('/api/announcements')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: '정상 공지 제목', content: '본문' });
    expect([200, 201]).toContain(res.status);
    const id = res.body?.data?.id;
    if (id) await Announcement.destroy({ where: { id }, force: true });
  });
});
