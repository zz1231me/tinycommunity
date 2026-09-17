import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { PostScrap } from '../models/PostScrap';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

// 스크랩 엔드포인트의 게시판 교차 확인.
//
// 주소는 /api/posts/:boardType/:id/scrap 이고, 라우트는 :boardType 으로 '그 게시판을
// 읽을 수 있는가' 만 본다. 글이 정말 그 게시판 소속인지 확인하지 않으면, 읽을 수 있는
// 게시판 이름을 붙여 다른 게시판의 글에 손댈 수 있다 — 없는 id 는 404, 있는 id 는 200 이라
// 남의 게시판에 어떤 글이 있는지 훑는 창구가 된다.
//
// 좋아요·태그·댓글·읽음은 모두 이 교차 확인을 하고 각각 주석까지 달려 있었다.
// 스크랩만 빠져 있었다.

const CLOSED = 'scrapclosed';
let adminCookie: string;
let userCookie: string;
let closedPostId: string;
let openPostId: string;

const scrap = (cookie: string, boardType: string, postId: string) =>
  request(app)
    .post(`/api/posts/${boardType}/${postId}/scrap`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie);

const status = (cookie: string, boardType: string, postId: string) =>
  request(app).get(`/api/posts/${boardType}/${postId}/scrap`).set('Cookie', cookie);

async function createPost(boardType: string, title: string): Promise<string> {
  const res = await request(app)
    .post(`/api/posts/${boardType}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title, content: '<p>x</p>' });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'post.scrap' } });
  await FeatureFlag.create({ key: 'post.scrap', enabled: true });
  featureFlagService.invalidate();

  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  // 일반 사용자는 읽을 수 없는 게시판
  await Board.findOrCreate({
    where: { id: CLOSED },
    defaults: {
      id: CLOSED,
      name: '관리자 전용',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      order: 91,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: CLOSED, roleId: 'admin' },
    defaults: { boardId: CLOSED, roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
  });

  closedPostId = await createPost(CLOSED, `닫힌 글 ${Date.now()}`);
  openPostId = await createPost('notice', `열린 글 ${Date.now()}`);
});

beforeEach(async () => {
  await PostScrap.destroy({ where: {}, truncate: true });
});

describe('읽을 수 있는 게시판 이름을 빌려 다른 게시판 글에 손대지 못한다', () => {
  it('교차 게시판 스크랩은 없는 글과 똑같이 답한다', async () => {
    // notice 는 읽을 수 있지만, 이 글은 notice 의 글이 아니다
    const res = await scrap(userCookie, 'notice', closedPostId);
    expect(res.status).toBe(404);

    // 막혔다면 줄도 생기지 않아야 한다
    expect(await PostScrap.count({ where: { PostId: closedPostId } })).toBe(0);
  });

  it('상태 조회도 마찬가지다 — 500 이 아니라 404 로 답한다', async () => {
    // 인가 실패를 500 으로 뭉개면 막았다는 사실이 응답에 드러나지 않는다
    const res = await status(userCookie, 'notice', closedPostId);
    expect(res.status).toBe(404);
  });

  it('없는 글과 있는 글의 답이 같다 — 존재를 알려 주지 않는다', async () => {
    const real = await status(userCookie, 'notice', closedPostId);
    const fake = await status(userCookie, 'notice', '00000000-0000-4000-8000-000000000000');
    // 서로 같은지만 보면 교차 확인을 꺼도 둘 다 같은 값이 되어 그대로 통과한다 —
    // 실제로 그랬다. 둘 다 404 인지까지 못박아야 이 테스트가 무언가를 붙잡는다.
    expect(real.status).toBe(404);
    expect(fake.status).toBe(404);
  });
});

describe('제대로 된 요청은 그대로 된다 — 양성 대조', () => {
  it('읽을 수 있는 게시판의 글은 스크랩된다', async () => {
    // 이것이 없으면 '전부 404' 인 구현도 위 테스트들을 통과한다
    const res = await scrap(userCookie, 'notice', openPostId);
    expect(res.status).toBe(200);
    expect(res.body.data.scrapped).toBe(true);
    expect(await PostScrap.count({ where: { PostId: openPostId } })).toBe(1);
  });

  it('한 번 더 누르면 풀린다', async () => {
    await scrap(userCookie, 'notice', openPostId);
    const off = await scrap(userCookie, 'notice', openPostId);
    expect(off.body.data.scrapped).toBe(false);
    expect(await PostScrap.count({ where: { PostId: openPostId } })).toBe(0);
  });

  it('상태 조회도 제 게시판에서는 정상이다', async () => {
    await scrap(userCookie, 'notice', openPostId);
    const res = await status(userCookie, 'notice', openPostId);
    expect(res.status).toBe(200);
    expect(res.body.data.scrapped).toBe(true);
  });

  it('관리자는 자기 게시판의 글을 그대로 스크랩한다', async () => {
    const res = await scrap(adminCookie, CLOSED, closedPostId);
    expect(res.status).toBe(200);
    expect(res.body.data.scrapped).toBe(true);
  });
});
