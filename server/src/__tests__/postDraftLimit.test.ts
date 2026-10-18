// 임시저장이 쌓이는 데에도 끝이 있어야 한다.
//
// 기능을 써 보다 발견했다. 초안은 사람마다 몇 개든 쌓을 수 있었고, 한 줄마다 글 본문이
// 통째로 들어 있다. 목록은 50개까지만 보여 주므로 그 너머는 화면에서 손댈 길도 없다 —
// 지우지도 못하면서 남는다. 이 프로젝트의 다른 목록(저장한 조건 20, 북마크 500)은
// 모두 상한이 있다. 여기만 없었다.
//
// 새로 만들 때 가장 오래된 것부터 정리한다. 막는 쪽이 아니라 정리하는 쪽인 이유는,
// 자동 저장 중에 거절하면 쓰던 글을 잃기 때문이다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { PostDraft } from '../models/PostDraft';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { MAX_DRAFTS_PER_USER } from '../services/postDraft.service';

let cookie: string;

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'post.drafts' } });
  await FeatureFlag.create({ key: 'post.drafts', enabled: true });
  featureFlagService.invalidate();
  cookie = await loginAs('testuser', 'TestUser123!');
});

beforeEach(async () => {
  await PostDraft.destroy({ where: { UserId: 'testuser' }, force: true });
});

const create = (title: string) =>
  request(app)
    .post('/api/drafts')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ boardType: 'notice', title, content: '<p>내용</p>' });

describe('임시저장 개수', () => {
  it('상한을 넘으면 가장 오래된 것부터 사라진다', async () => {
    // 상한만큼 미리 채운다 — updatedAt 이 서로 다르게 한 개씩
    for (let i = 0; i < MAX_DRAFTS_PER_USER; i++) {
      const res = await create(`초안 ${i}`);
      expect(res.status).toBe(201);
    }
    expect(await PostDraft.count({ where: { UserId: 'testuser' } })).toBe(MAX_DRAFTS_PER_USER);

    const extra = await create('새 초안');
    // 자동 저장 중이므로 거절하지 않는다
    expect(extra.status).toBe(201);
    expect(await PostDraft.count({ where: { UserId: 'testuser' } })).toBe(MAX_DRAFTS_PER_USER);

    const titles = (await PostDraft.findAll({ where: { UserId: 'testuser' } })).map(d => d.title);
    expect(titles).toContain('새 초안');
    expect(titles).not.toContain('초안 0');
  });

  it('남의 초안은 건드리지 않는다', async () => {
    await PostDraft.create({
      UserId: 'admin',
      boardType: 'notice',
      title: '관리자 초안',
      content: '<p>x</p>',
    });

    for (let i = 0; i < MAX_DRAFTS_PER_USER + 3; i++) {
      await create(`초안 ${i}`);
    }

    expect(await PostDraft.count({ where: { UserId: 'admin' } })).toBe(1);
  });

  it('상한 안에서는 그대로 쌓인다 — 양성 대조', async () => {
    for (let i = 0; i < 5; i++) await create(`초안 ${i}`);
    expect(await PostDraft.count({ where: { UserId: 'testuser' } })).toBe(5);
  });
});
