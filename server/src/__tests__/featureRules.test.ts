import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { FeatureFlag } from '../models/FeatureFlag';
import { FeatureRule } from '../models/FeatureRule';
import Board from '../models/Board';
import { Notification } from '../models/Notification';
import { featureFlagService } from '../services/featureFlag.service';
import { sendDueReminders } from '../services/taskDue.service';

// 역할·사람별 기능 예외.
//
// 판정 순서: 사이트 전체 꺼짐 → 꺼짐 / 사람 예외 → 그 값 / 역할 규칙 → 그 값 / 없음 → 켜짐.
//
// 지켜야 하는 선:
//  1. 화면만이 아니라 서버도 막는다 — 메뉴를 숨겨도 주소로 부르면 열리는 상태가 되면 안 된다.
//  2. 사이트 전체가 꺼져 있으면 어떤 예외로도 못 켠다.
//  3. 관리자는 예외를 받지 않는다 — 규칙을 잘못 걸어 되돌릴 화면까지 잃으면 안 된다.
//  4. 본인 메뉴 숨기기는 보기 설정일 뿐 권한이 아니다.

let adminCookie: string;
let userCookie: string;

function setRoleRules(roleId: string, body: Record<string, unknown>, cookie = adminCookie) {
  return request(app)
    .put(`/api/admin/features/roles/${roleId}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body);
}

function setUserRules(userId: string, body: Record<string, unknown>, cookie = adminCookie) {
  return request(app)
    .put(`/api/admin/features/users/${userId}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send(body);
}

const memos = (cookie: string) => request(app).get('/api/memos').set('Cookie', cookie);
const myFeatures = async (cookie: string) =>
  (await request(app).get('/api/features').set('Cookie', cookie)).body.data as Record<
    string,
    boolean
  >;

async function reset() {
  await FeatureFlag.destroy({ where: {}, truncate: true });
  await FeatureRule.destroy({ where: {}, truncate: true });
  featureFlagService.invalidate();
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

beforeEach(reset);
afterAll(reset);

describe('역할 규칙', () => {
  it('역할에서 끄면 그 역할은 API 가 403, 다른 역할(관리자)은 그대로', async () => {
    expect((await memos(userCookie)).status).toBe(200);
    expect((await setRoleRules('user', { 'tools.memo': false })).status).toBe(200);

    const blocked = await memos(userCookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('FEATURE_DISABLED');
    expect((await memos(adminCookie)).status).toBe(200);
  });

  it('라우터 전체 앞에 붙은 스위치도 사람 기준으로 막힌다 — 인증 전에 도는 자리다', async () => {
    // /api/memos 는 app.use 로 requireFeature 가 authenticate 보다 앞에 있다
    await setRoleRules('user', { 'tools.memo': false });
    expect((await memos(userCookie)).status).toBe(403);
  });

  it('로그인하지 않은 요청은 예외와 무관하게 원래대로 401', async () => {
    await setRoleRules('user', { 'tools.memo': false });
    expect((await request(app).get('/api/memos')).status).toBe(401);
  });

  it('null 로 규칙을 지우면 다시 켜진다', async () => {
    await setRoleRules('user', { 'tools.memo': false });
    await setRoleRules('user', { 'tools.memo': null });
    expect((await memos(userCookie)).status).toBe(200);
  });

  it('의존성도 역할 기준으로 따진다 — 태그를 끈 역할은 태그 클라우드도 꺼진다', async () => {
    await setRoleRules('user', { 'post.tags': false });
    const flags = await myFeatures(userCookie);
    expect(flags['post.tags']).toBe(false);
    expect(flags['discovery.tagCloud']).toBe(false);
    // 다른 사람에게는 영향이 없다
    expect((await myFeatures(adminCookie))['discovery.tagCloud']).toBe(true);
  });

  it('관리자 역할에는 규칙을 걸 수 없다', async () => {
    const res = await setRoleRules('admin', { 'tools.memo': false });
    expect(res.status).toBe(400);
  });

  it('없는 역할·모르는 기능·잘못된 값은 거절한다', async () => {
    expect((await setRoleRules('nope', { 'tools.memo': false })).status).toBe(404);
    expect((await setRoleRules('user', { 'tools.nope': false })).status).toBe(400);
    expect((await setRoleRules('user', { 'tools.memo': 'off' })).status).toBe(400);
    expect((await setRoleRules('user', {})).status).toBe(400);
  });

  it('일반 사용자는 규칙을 바꿀 수 없다', async () => {
    expect((await setRoleRules('user', { 'tools.memo': false }, userCookie)).status).toBe(403);
    expect((await setUserRules('testuser', { 'tools.memo': true }, userCookie)).status).toBe(403);
  });

  it('관리자 카탈로그에 역할 규칙과 개인 예외 수가 함께 온다', async () => {
    await setRoleRules('user', { 'tools.memo': false });
    await setUserRules('testuser', { 'tools.memo': true });
    const res = await request(app).get('/api/admin/features').set('Cookie', adminCookie);
    const memo = res.body.data.features.find((f: { key: string }) => f.key === 'tools.memo');
    expect(memo.roleRules).toEqual({ user: false });
    expect(memo.userRuleCount).toBe(1);
  });
});

describe('개인 예외', () => {
  it('역할에서 꺼도 개인 예외로 허용할 수 있다', async () => {
    await setRoleRules('user', { 'tools.memo': false });
    await setUserRules('testuser', { 'tools.memo': true });
    expect((await memos(userCookie)).status).toBe(200);
  });

  it('역할은 그대로 두고 한 사람만 막을 수 있다', async () => {
    await setUserRules('testuser', { 'tools.memo': false });
    expect((await memos(userCookie)).status).toBe(403);
  });

  it('사이트 전체가 꺼져 있으면 개인 예외로도 켤 수 없다', async () => {
    await request(app)
      .put('/api/admin/features')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ 'tools.memo': false });
    await setUserRules('testuser', { 'tools.memo': true });
    expect((await memos(userCookie)).status).toBe(403);
  });

  it('한 사람의 사이트·역할·개인 값과 결과를 보여 준다', async () => {
    await setRoleRules('user', { 'tools.memo': false });
    await setUserRules('testuser', { 'tools.memo': true });
    const res = await request(app)
      .get('/api/admin/features/users/testuser')
      .set('Cookie', adminCookie);
    const memo = res.body.data.features.find((f: { key: string }) => f.key === 'tools.memo');
    expect(memo).toMatchObject({ site: true, role: false, user: true, effective: true });
  });

  it('관리자 계정에는 개인 예외를 걸 수 없다', async () => {
    expect((await setUserRules('admin', { 'tools.memo': false })).status).toBe(400);
  });

  it('없는 사용자는 404', async () => {
    expect((await setUserRules('nobody', { 'tools.memo': false })).status).toBe(404);
  });
});

describe('기능 밖 경로도 사람 기준', () => {
  it('업무 기능이 꺼진 사람에게는 마감 알림을 보내지 않는다', async () => {
    await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
    const created = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `기능꺼짐마감 ${Date.now()}`, content: '<p>.</p>' });
    const id = created.body.data.id;
    await request(app)
      .patch(`/api/posts/notice/${id}/task`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ assigneeId: 'testuser', workStatus: 'todo', dueDate: '2026-10-11' });
    await Notification.destroy({ where: {} });

    await setUserRules('testuser', { 'post.tasks': false });
    await sendDueReminders(new Date(2026, 9, 11, 10, 0));
    expect(await Notification.count({ where: { type: 'TASK_DUE', relatedId: id } })).toBe(0);

    // 대조군: 예외를 지우면 보낸다
    await setUserRules('testuser', { 'post.tasks': null });
    await sendDueReminders(new Date(2026, 9, 11, 10, 0));
    expect(await Notification.count({ where: { type: 'TASK_DUE', relatedId: id } })).toBe(1);
  });
});

describe('본인 메뉴 숨기기', () => {
  const put = (body: unknown) =>
    request(app)
      .put('/api/features/hidden-menus')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send(body as object);

  it('저장하고 다시 읽는다. 겹친 키는 하나로', async () => {
    const res = await put({ hiddenMenus: ['tools.memo', 'tools.wiki', 'tools.memo'] });
    expect(res.status).toBe(200);
    const read = await request(app).get('/api/features/hidden-menus').set('Cookie', userCookie);
    expect(read.body.data).toEqual(['tools.memo', 'tools.wiki']);
    await put({ hiddenMenus: [] });
  });

  it('숨겨도 권한은 그대로다 — 주소로 들어가면 열린다', async () => {
    await put({ hiddenMenus: ['tools.memo'] });
    expect((await memos(userCookie)).status).toBe(200);
    await put({ hiddenMenus: [] });
  });

  it('모르는 키나 배열이 아닌 값은 400', async () => {
    expect((await put({ hiddenMenus: ['tools.nope'] })).status).toBe(400);
    expect((await put({ hiddenMenus: 'tools.memo' })).status).toBe(400);
  });

  it('로그인 없이는 401', async () => {
    expect((await request(app).get('/api/features/hidden-menus')).status).toBe(401);
  });
});
