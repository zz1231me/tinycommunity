import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { assertFeatureCatalog, resolveFeatures, FEATURE_KEYS } from '../config/features';

// 기능 스위치.
// 확인할 것은 하나다 — 껐을 때 API 가 실제로 막히는가.
// 화면에서 버튼만 사라지고 API 가 열려 있으면 스위치가 동작하지 않는 것이다.

let adminCookie: string;
let userCookie: string;

async function setFeature(key: string, enabled: boolean) {
  const res = await request(app)
    .put('/api/admin/features')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ [key]: enabled });
  expect(res.status).toBe(200);
}

/** 테스트가 끝나면 저장값을 지워 기본값(켜짐)으로 되돌린다 */
async function resetFeatures() {
  await FeatureFlag.destroy({ where: {}, truncate: true });
  featureFlagService.invalidate();
}

async function createPost(title: string): Promise<string> {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

afterEach(resetFeatures);

describe('카탈로그', () => {
  it('requires 에 적힌 키가 모두 실재한다', () => {
    expect(() => assertFeatureCatalog()).not.toThrow();
  });

  it('선행 기능을 끄면 파생 기능도 꺼진 것으로 본다', () => {
    const state = resolveFeatures({ 'post.attachments': false });
    expect(state['post.attachments']).toBe(false);
    // 저장값은 켜짐이지만 선행 기능이 꺼져 있으므로 실제로는 꺼진 것
    expect(state['post.inlineAttachments']).toBe(false);
  });

  it('저장값이 없으면 모두 기본값을 쓴다', () => {
    const state = resolveFeatures({});
    expect(Object.keys(state).sort()).toEqual([...FEATURE_KEYS].sort());
    expect(state['post.like']).toBe(true);
  });
});

describe('조회 권한', () => {
  it('로그인한 사용자는 켜진 기능 목록을 볼 수 있다', async () => {
    const res = await request(app).get('/api/features').set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.data['post.like']).toBe(true);
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/features')).status).toBe(401);
  });

  it('일반 사용자는 스위치를 바꿀 수 없다', async () => {
    const res = await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ 'post.like': false });
    expect(res.status).toBe(403);
  });
});

describe('저장', () => {
  it('바꾼 값이 조회에 반영된다', async () => {
    await setFeature('post.like', false);
    const res = await request(app).get('/api/features').set('Cookie', userCookie);
    expect(res.body.data['post.like']).toBe(false);
  });

  it('모르는 키는 조용히 버리지 않고 400 으로 알린다', async () => {
    const res = await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ 'post.nonexistent': false });
    expect(res.status).toBe(400);
  });

  it('true/false 가 아닌 값은 400', async () => {
    const res = await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ 'post.like': 'yes' });
    expect(res.status).toBe(400);
  });

  it('관리자 카탈로그는 저장값과 실효값을 함께 준다', async () => {
    await setFeature('post.attachments', false);

    const res = await request(app).get('/api/admin/features').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const inline = res.body.data.features.find(
      (f: { key: string }) => f.key === 'post.inlineAttachments'
    );
    // 관리자가 직접 끈 적은 없지만(enabled=true) 선행 기능 때문에 실제로는 꺼져 있다
    expect(inline.enabled).toBe(true);
    expect(inline.effective).toBe(false);
    expect(inline.requires).toContain('post.attachments');
  });
});

describe('껐을 때 API 가 실제로 막힌다', () => {
  it('좋아요를 끄면 좋아요 API 가 403', async () => {
    const id = await createPost(`좋아요차단 ${Date.now()}`);
    await setFeature('post.like', false);

    const res = await request(app)
      .post(`/api/posts/notice/${id}/like`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FEATURE_DISABLED');
  });

  it('스크랩을 끄면 스크랩 API 와 목록이 모두 403', async () => {
    const id = await createPost(`스크랩차단 ${Date.now()}`);
    await setFeature('post.scrap', false);

    expect(
      (
        await request(app)
          .post(`/api/posts/notice/${id}/scrap`)
          .set(CSRF_HEADER)
          .set('Cookie', userCookie)
      ).status
    ).toBe(403);
    expect(
      (await request(app).get('/api/posts/scraps/mine').set('Cookie', userCookie)).status
    ).toBe(403);
  });

  it('인기글을 끄면 인기글 API 가 403', async () => {
    await setFeature('discovery.popular', false);
    expect((await request(app).get('/api/posts/popular').set('Cookie', userCookie)).status).toBe(
      403
    );
  });

  it('전역 검색을 끄면 검색 API 가 403', async () => {
    await setFeature('search.global', false);
    expect(
      (await request(app).get('/api/posts/search/global?q=x').set('Cookie', userCookie)).status
    ).toBe(403);
  });

  it('임시저장을 끄면 초안 API 전체가 403', async () => {
    await setFeature('post.drafts', false);
    expect((await request(app).get('/api/drafts').set('Cookie', userCookie)).status).toBe(403);
  });

  it('메모를 끄면 메모 API 전체가 403', async () => {
    await setFeature('tools.memo', false);
    expect((await request(app).get('/api/memos').set('Cookie', userCookie)).status).toBe(403);
  });

  it('출퇴근을 끄면 출근·퇴근 기록이 막힌다', async () => {
    await setFeature('tools.attendance', false);
    expect((await request(app).get('/api/attendance/me').set('Cookie', userCookie)).status).toBe(
      403
    );
    expect(
      (
        await request(app)
          .post('/api/attendance/check-in')
          .set(CSRF_HEADER)
          .set('Cookie', userCookie)
          .send({})
      ).status
    ).toBe(403);
  });

  it('출퇴근을 꺼도 관리자는 지난 기록을 볼 수 있다', async () => {
    // 기능을 껐다고 이미 쌓인 근태 기록까지 못 보게 하면 정산이 막힌다.
    await setFeature('tools.attendance', false);
    expect(
      (await request(app).get('/api/admin/attendance/records').set('Cookie', adminCookie)).status
    ).toBe(200);
  });

  it('태그를 끄면 태그 클라우드도 함께 막힌다 (의존성)', async () => {
    await setFeature('post.tags', false);
    expect((await request(app).get('/api/tags/cloud').set('Cookie', userCookie)).status).toBe(403);
  });

  it('태그를 끄면 게시글의 태그 조회·저장도 막힌다', async () => {
    // /api/tags 만 막고 게시글 태그 API 를 열어 두면 관리 화면에서만 사라지고
    // 글마다 태그는 그대로 붙는다.
    const id = await createPost(`태그차단 ${Date.now()}`);
    await setFeature('post.tags', false);

    expect(
      (await request(app).get(`/api/posts/notice/${id}/tags`).set('Cookie', adminCookie)).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/posts/notice/${id}/tags`)
          .set(CSRF_HEADER)
          .set('Cookie', adminCookie)
          .send({ tagIds: [] })
      ).status
    ).toBe(403);
  });

  it('수정 이력을 끄면 이력 API 가 403', async () => {
    const id = await createPost(`이력차단 ${Date.now()}`);
    await setFeature('post.revisions', false);
    expect(
      (await request(app).get(`/api/posts/notice/${id}/revisions`).set('Cookie', adminCookie))
        .status
    ).toBe(403);
  });
});

describe('껐던 기능을 다시 켜면 곧바로 돌아온다', () => {
  it('좋아요를 껐다 켜면 다시 눌린다', async () => {
    const id = await createPost(`복구 ${Date.now()}`);
    await setFeature('post.like', false);
    await setFeature('post.like', true);

    const res = await request(app)
      .post(`/api/posts/notice/${id}/like`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie);
    expect(res.status).toBe(200);
  });
});

describe('켜져 있으면 아무것도 달라지지 않는다', () => {
  it('기본 상태에서는 좋아요·검색·초안이 정상 동작한다', async () => {
    const id = await createPost(`정상 ${Date.now()}`);
    expect(
      (
        await request(app)
          .post(`/api/posts/notice/${id}/like`)
          .set(CSRF_HEADER)
          .set('Cookie', userCookie)
      ).status
    ).toBe(200);
    expect(
      (await request(app).get('/api/posts/search/global?q=정상').set('Cookie', userCookie)).status
    ).toBe(200);
    expect((await request(app).get('/api/drafts').set('Cookie', userCookie)).status).toBe(200);
  });
});
