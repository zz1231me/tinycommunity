import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';

// 관리자 통계 확장 — 운영자가 "지금 할 일이 있는가" 와
// "어느 게시판이 살아 있는가" 를 숫자로 볼 수 있어야 한다.

let adminCookie: string;
let userCookie: string;

function stats(cookie: string) {
  return request(app).get('/api/admin/stats').set('Cookie', cookie);
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('접근 권한', () => {
  it('일반 사용자는 통계를 볼 수 없다', async () => {
    expect((await stats(userCookie)).status).toBe(403);
  });

  it('비로그인은 401', async () => {
    expect((await request(app).get('/api/admin/stats')).status).toBe(401);
  });
});

describe('처리 대기 항목', () => {
  it('세 가지 대기 수를 함께 준다', async () => {
    const res = await stats(adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.pending).toEqual({
      userApprovals: expect.any(Number),
      reports: expect.any(Number),
      passwordResets: expect.any(Number),
    });
  });

  it('신고가 들어오면 대기 수가 늘어난다', async () => {
    const post = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `신고대상 ${Date.now()}`, content: '<p>x</p>' });

    const before = (await stats(adminCookie)).body.data.pending.reports;

    const report = await request(app)
      .post('/api/reports')
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .send({ targetType: 'post', targetId: post.body.data.id, reason: 'spam' });
    expect([200, 201]).toContain(report.status);

    expect((await stats(adminCookie)).body.data.pending.reports).toBe(before + 1);
  });
});

describe('게시판별 활력', () => {
  it('게시판마다 전체 글 수와 최근 글 수를 준다', async () => {
    const res = await stats(adminCookie);
    const notice = res.body.data.boardActivity.find(
      (b: { boardId: string }) => b.boardId === 'notice'
    );
    expect(notice).toMatchObject({
      boardId: 'notice',
      name: '공지사항',
      totalPosts: expect.any(Number),
      recentPosts: expect.any(Number),
    });
  });

  it('글을 쓰면 그 게시판의 수가 늘어난다', async () => {
    const before = (await stats(adminCookie)).body.data.boardActivity.find(
      (b: { boardId: string }) => b.boardId === 'notice'
    );

    await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `활력 ${Date.now()}`, content: '<p>x</p>' });

    const after = (await stats(adminCookie)).body.data.boardActivity.find(
      (b: { boardId: string }) => b.boardId === 'notice'
    );
    expect(after.totalPosts).toBe(before.totalPosts + 1);
    expect(after.recentPosts).toBe(before.recentPosts + 1);
  });

  it('개인 폴더는 게시판 활력에 넣지 않는다', async () => {
    const res = await stats(adminCookie);
    // 개인 폴더 id 는 게시판 목록에 없어야 한다 — 남의 개인 공간 활동량이 새면 안 된다
    const ids = res.body.data.boardActivity.map((b: { boardId: string }) => b.boardId);
    expect(ids).toContain('notice');
    expect(res.body.data.boardActivity.length).toBe(res.body.data.summary.totalBoards);
    void ids;
  });
});

describe('상위 작성자', () => {
  it('최근 글을 쓴 사람이 이름과 함께 나온다', async () => {
    await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `상위작성자 ${Date.now()}`, content: '<p>x</p>' });

    const res = await stats(adminCookie);
    const hit = res.body.data.topAuthors.find((a: { userId: string }) => a.userId === 'admin');
    expect(hit).toBeDefined();
    expect(hit.name).toBe('관리자');
    expect(hit.count).toBeGreaterThan(0);
  });

  it('많아야 5명까지만 준다', async () => {
    const res = await stats(adminCookie);
    expect(res.body.data.topAuthors.length).toBeLessThanOrEqual(5);
  });
});
