// server/src/__tests__/idorSweep.test.ts
// 남의 것을 건드릴 수 있는지 훑는다.
//
// 개인 자원(메모·알림)은 "로그인했는가" 만으로는 부족하고 "그게 네 것인가" 까지
// 봐야 한다. 각 항목마다 소유자가 되는 것(양성 대조)을 먼저 확인한다 —
// 경로를 잘못 적어 404 가 나오면 '남이 못 건드린다' 가 헛통과하기 때문이다.

import request from 'supertest';
import { app, seedTestData, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { notificationService } from '../services/notification.service';
import { Notification } from '../models/Notification';
import Board from '../models/Board';

const PASSWORD = 'TestUser123!';
let cookieA = '';
let cookieB = '';

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

async function setFeature(key: string, enabled: boolean) {
  await FeatureFlag.destroy({ where: { key } });
  await FeatureFlag.create({ key, enabled });
  featureFlagService.invalidate();
}

beforeAll(async () => {
  await seedTestData();
  await setFeature('tools.memo', true);
  cookieA = await makeUser('idor-a', '갑');
  cookieB = await makeUser('idor-b', '을');
});

describe('메모 — 남의 것', () => {
  let memoId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/memos')
      .set(CSRF_HEADER)
      .set('Cookie', cookieA)
      .send({ title: '갑의 비밀 메모', content: '남이 보면 안 되는 내용' });
    expect([200, 201]).toContain(res.status); // 양성 대조: 만들 수 있어야 한다
    memoId = String(res.body?.data?.id ?? res.body?.id ?? '');
    expect(memoId).not.toBe('');
  });

  it('소유자는 자기 목록에서 본다', async () => {
    const res = await request(app).get('/api/memos').set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('갑의 비밀 메모');
  });

  it('남의 목록에는 나오지 않는다', async () => {
    const res = await request(app).get('/api/memos').set('Cookie', cookieB);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('갑의 비밀 메모');
  });

  it('남은 고칠 수 없다', async () => {
    const res = await request(app)
      .put(`/api/memos/${memoId}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieB)
      .send({ title: '덮어쓰기', content: '덮어쓰기' });
    expect(res.status).not.toBe(200);
  });

  it('남은 지울 수 없다', async () => {
    const res = await request(app)
      .delete(`/api/memos/${memoId}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieB);
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(204);
  });

  it('위 검사 뒤에도 메모는 그대로 남아 있다', async () => {
    const res = await request(app).get('/api/memos').set('Cookie', cookieA);
    expect(JSON.stringify(res.body)).toContain('갑의 비밀 메모');
  });
});

describe('알림 — 남의 것', () => {
  let noticeId = 0;

  beforeAll(async () => {
    await Notification.destroy({ where: { userId: 'idor-a' } });
    const created = await notificationService.create({
      userId: 'idor-a',
      // SYSTEM 은 끌 수 없는 종류라 사용자 설정과 무관하게 항상 만들어진다
      type: 'SYSTEM',
      message: '갑에게만 가는 알림',
    });
    expect(created).not.toBeNull();
    noticeId = created!.id;
  });

  it('남은 읽음 처리할 수 없다', async () => {
    const res = await request(app)
      .put(`/api/notifications/${noticeId}/read`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieB);
    expect(res.status).not.toBe(200);
    const row = await Notification.findByPk(noticeId);
    expect(row?.isRead).toBe(false);
  });

  it('남은 지울 수 없다', async () => {
    const res = await request(app)
      .delete(`/api/notifications/${noticeId}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieB);
    expect(res.status).not.toBe(200);
    expect(await Notification.findByPk(noticeId)).not.toBeNull();
  });

  it('소유자는 읽음 처리할 수 있다 — 위 검사가 경로 오류로 통과한 것이 아님을 보인다', async () => {
    const res = await request(app)
      .put(`/api/notifications/${noticeId}/read`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieA);
    expect(res.status).toBe(200);
    const row = await Notification.findByPk(noticeId);
    expect(row?.isRead).toBe(true);
  });
});

describe('임시보관 — 남의 것', () => {
  let draftId = '';

  beforeAll(async () => {
    await setFeature('post.drafts', true);
    const board = await Board.findOne();
    expect(board).not.toBeNull();
    const res = await request(app)
      .post('/api/drafts')
      .set(CSRF_HEADER)
      .set('Cookie', cookieA)
      .send({ boardType: board!.id, title: '갑의 임시글', content: '아직 안 올린 내용' });
    expect([200, 201]).toContain(res.status); // 양성 대조
    draftId = String(res.body?.data?.id ?? res.body?.id ?? '');
    expect(draftId).not.toBe('');
  });

  it('소유자는 꺼내 볼 수 있다', async () => {
    const res = await request(app).get(`/api/drafts/${draftId}`).set('Cookie', cookieA);
    expect(res.status).toBe(200);
  });

  it('남은 꺼내 볼 수 없다', async () => {
    const res = await request(app).get(`/api/drafts/${draftId}`).set('Cookie', cookieB);
    expect(res.status).not.toBe(200);
  });

  it('남은 고칠 수 없다', async () => {
    const res = await request(app)
      .put(`/api/drafts/${draftId}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieB)
      .send({ title: '덮어쓰기', content: '덮어쓰기' });
    expect(res.status).not.toBe(200);
  });

  it('남은 지울 수 없다 — 지운 뒤에도 소유자에게 남아 있다', async () => {
    const res = await request(app)
      .delete(`/api/drafts/${draftId}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieB);
    expect([200, 204]).not.toContain(res.status);
    const mine = await request(app).get(`/api/drafts/${draftId}`).set('Cookie', cookieA);
    expect(mine.status).toBe(200);
  });
});

describe('쪽지 — 남의 대화', () => {
  let cookieC = '';
  let conversationId = '';

  beforeAll(async () => {
    await setFeature('social.dm', true);
    cookieC = await makeUser('idor-c', '병');

    const sent = await request(app)
      .post('/api/messages')
      .set(CSRF_HEADER)
      .set('Cookie', cookieA)
      .send({ recipientId: 'idor-b', content: '갑이 을에게만 하는 말' });
    expect([200, 201]).toContain(sent.status); // 양성 대조

    const list = await request(app).get('/api/messages/conversations').set('Cookie', cookieA);
    expect(list.status).toBe(200);
    const rows = list.body?.data?.conversations ?? list.body?.data ?? [];
    conversationId = String(rows[0]?.id ?? '');
    expect(conversationId).not.toBe('');
  });

  it('상대는 받은 대화를 볼 수 있다', async () => {
    const res = await request(app)
      .get(`/api/messages/conversations/${conversationId}`)
      .set('Cookie', cookieB);
    expect(res.status).toBe(200);
  });

  it('제3자는 남의 대화를 볼 수 없다', async () => {
    const res = await request(app)
      .get(`/api/messages/conversations/${conversationId}`)
      .set('Cookie', cookieC);
    expect(res.status).not.toBe(200);
  });

  it('제3자는 남의 대화를 지울 수 없다', async () => {
    const res = await request(app)
      .delete(`/api/messages/conversations/${conversationId}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookieC);
    expect([200, 204]).not.toContain(res.status);
    const still = await request(app)
      .get(`/api/messages/conversations/${conversationId}`)
      .set('Cookie', cookieB);
    expect(still.status).toBe(200);
  });
});
