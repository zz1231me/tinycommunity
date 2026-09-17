// server/src/__tests__/stateTransitionMatrix.test.ts
// 두 번 하기 · 없는 것에 하기 · 순서 뒤집기.
//
// 오늘 나온 결함이 전부 이 계열이었다 — 4xx 여야 할 것이 5xx 로 나가고(관리자 사용자
// 비활성화·복구), 막혔어야 할 쓰기가 조용히 성공하고(본문 널 바이트), 실패한 기록이
// 소리 없이 사라졌다. 공통점은 "정상 경로" 가 아니라 그 옆길이라는 것이다.
//
// 그래서 모든 자원에 같은 질문을 던진다.
//   - 지운 것을 또 지우면? (2xx 로 조용히 성공하면 안 된다 — 지울 게 없었는데 있었다고 답하는 셈)
//   - 없는 것을 건드리면? (4xx 여야 하고 5xx 면 안 된다)
//   - 지운 것을 읽으면?
//   - 되돌릴 수 없는 상태에서 되돌리면?
// 그리고 어떤 경우에도 5xx 는 없다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { User } from '../models/User';

let admin = '';
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const THROWAWAY_PW = 'Throwaway123!';

/** 5xx 는 어떤 옆길에서도 나오면 안 된다 */
function noServerError(status: number, label: string) {
  if (status >= 500) throw new Error(`${label} → HTTP ${status} (옆길에서 서버가 무너졌다)`);
}

async function makeUser(id: string) {
  if (!(await User.findByPk(id))) {
    await User.create({
      id,
      password: THROWAWAY_PW,
      name: `일회용 ${id}`,
      email: `${id}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
  return id;
}

async function makePost(): Promise<string> {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', admin)
    .send({ title: `전이 테스트 ${uniq()}`, content: '<p>x</p>' });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

beforeAll(async () => {
  await seedTestData();
  admin = await loginAs('admin', 'TestAdmin123!');
  await FeatureFlag.destroy({ where: { key: 'tools.memo' } });
  await FeatureFlag.create({ key: 'tools.memo', enabled: true });
  featureFlagService.invalidate();
});

describe('두 번 지우면 두 번째는 실패해야 한다', () => {
  it('게시글', async () => {
    const id = await makePost();
    const first = await request(app)
      .delete(`/api/posts/notice/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    expect(first.status).toBe(200); // 양성 대조 — 첫 삭제가 실제로 됐다

    const second = await request(app)
      .delete(`/api/posts/notice/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    noServerError(second.status, '게시글 재삭제');
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('댓글', async () => {
    const postId = await makePost();
    const created = await request(app)
      .post(`/api/comments/notice/${postId}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({ content: '지울 댓글' });
    expect(created.status).toBe(201);
    const commentId = created.body.data?.id ?? created.body.data?.comment?.id;

    const first = await request(app)
      .delete(`/api/comments/notice/${commentId}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    expect(first.status).toBe(200);

    const second = await request(app)
      .delete(`/api/comments/notice/${commentId}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    noServerError(second.status, '댓글 재삭제');
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('위키', async () => {
    const slug = `st-${uniq()}`;
    const created = await request(app)
      .post('/api/wiki')
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({ slug, title: '지울 위키' });
    expect(created.status).toBe(201);

    const first = await request(app)
      .delete(`/api/wiki/${slug}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    expect(first.status).toBe(200);

    const second = await request(app)
      .delete(`/api/wiki/${slug}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    noServerError(second.status, '위키 재삭제');
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it('메모', async () => {
    const created = await request(app)
      .post('/api/memos')
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({ title: '지울 메모', content: 'x' });
    expect(created.status).toBeLessThan(300);
    const memoId = created.body.data?.id;

    const first = await request(app)
      .delete(`/api/memos/${memoId}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    expect(first.status).toBeLessThan(300);

    const second = await request(app)
      .delete(`/api/memos/${memoId}`)
      .set(CSRF_HEADER)
      .set('Cookie', admin);
    noServerError(second.status, '메모 재삭제');
    expect(second.status).toBeGreaterThanOrEqual(400);
  });
});

describe('지운 것을 읽으면 없다고 해야 한다', () => {
  it('게시글', async () => {
    const id = await makePost();
    await request(app).delete(`/api/posts/notice/${id}`).set(CSRF_HEADER).set('Cookie', admin);

    const res = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', admin);
    noServerError(res.status, '삭제된 게시글 조회');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('메모 목록에서도 사라진다', async () => {
    const created = await request(app)
      .post('/api/memos')
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({ title: `사라질 메모 ${uniq()}`, content: 'x' });
    const memoId = created.body.data?.id;
    const title = created.body.data?.title;

    await request(app).delete(`/api/memos/${memoId}`).set(CSRF_HEADER).set('Cookie', admin);

    const list = await request(app).get('/api/memos').set('Cookie', admin);
    noServerError(list.status, '메모 목록');
    expect(JSON.stringify(list.body)).not.toContain(title);
  });
});

describe('없는 것을 건드려도 5xx 가 아니다', () => {
  const GONE = '99999999';
  const cases: Array<[string, () => request.Test]> = [
    ['게시글 조회', () => request(app).get(`/api/posts/notice/${GONE}`).set('Cookie', admin)],
    [
      '게시글 삭제',
      () => request(app).delete(`/api/posts/notice/${GONE}`).set(CSRF_HEADER).set('Cookie', admin),
    ],
    [
      '댓글 삭제',
      () =>
        request(app).delete(`/api/comments/notice/${GONE}`).set(CSRF_HEADER).set('Cookie', admin),
    ],
    [
      '위키 삭제',
      () => request(app).delete('/api/wiki/no-such-page').set(CSRF_HEADER).set('Cookie', admin),
    ],
    [
      '메모 수정',
      () =>
        request(app)
          .put(`/api/memos/${GONE}`)
          .set(CSRF_HEADER)
          .set('Cookie', admin)
          .send({ title: 'x' }),
    ],
    [
      '메모 삭제',
      () => request(app).delete(`/api/memos/${GONE}`).set(CSRF_HEADER).set('Cookie', admin),
    ],
    [
      '알림 읽음',
      () =>
        request(app).put(`/api/notifications/${GONE}/read`).set(CSRF_HEADER).set('Cookie', admin),
    ],
    [
      '알림 삭제',
      () => request(app).delete(`/api/notifications/${GONE}`).set(CSRF_HEADER).set('Cookie', admin),
    ],
    ['초안 조회', () => request(app).get(`/api/drafts/${GONE}`).set('Cookie', admin)],
    [
      '초안 삭제',
      () => request(app).delete(`/api/drafts/${GONE}`).set(CSRF_HEADER).set('Cookie', admin),
    ],
  ];

  it.each(cases)('%s', async (label, call) => {
    const res = await call();
    noServerError(res.status, `없는 대상/${label}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('되돌릴 수 없는 상태에서 되돌리기', () => {
  it('삭제되지 않은 사용자를 복구하면 400 — 500 이 아니다', async () => {
    const id = await makeUser(`st_alive_${uniq()}`.slice(0, 28));
    const res = await request(app)
      .post(`/api/admin/users/${id}/restore`)
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({});
    noServerError(res.status, '멀쩡한 사용자 복구');
    expect(res.status).toBe(400);
  });

  it('없는 사용자를 비활성화하면 404 — 500 이 아니다', async () => {
    const res = await request(app)
      .patch('/api/admin/users/no_such_user_here/deactivate')
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({});
    noServerError(res.status, '없는 사용자 비활성화');
    expect(res.status).toBe(404);
  });

  it('같은 사용자를 두 번 비활성화해도 무너지지 않는다', async () => {
    const id = await makeUser(`st_deact_${uniq()}`.slice(0, 28));
    const first = await request(app)
      .patch(`/api/admin/users/${id}/deactivate`)
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({});
    expect(first.status).toBeLessThan(300);

    const second = await request(app)
      .patch(`/api/admin/users/${id}/deactivate`)
      .set(CSRF_HEADER)
      .set('Cookie', admin)
      .send({});
    noServerError(second.status, '재비활성화');
  });
});
