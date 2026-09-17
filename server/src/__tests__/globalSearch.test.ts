import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';

// 전역 검색 — 접근 제어와 요약 생성이 핵심이다.
// (조회를 병렬화하고 요약을 평문 컬럼에서 만들도록 바꾸면서 동작을 고정한다)

let adminCookie: string;
let userCookie: string;

function createPost(cookie: string, title: string, content: string) {
  return request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content });
}

function search(cookie: string, q: string) {
  return request(app).get('/api/posts/search/global').query({ q }).set('Cookie', cookie);
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

describe('GET /api/posts/search/global', () => {
  it('제목으로 게시글을 찾는다', async () => {
    await createPost(adminCookie, '고유한제목검색대상', '<p>본문</p>');

    const res = await search(adminCookie, '고유한제목검색대상');
    expect(res.status).toBe(200);
    const titles = res.body.data.results.map((r: { title: string }) => r.title);
    expect(titles).toContain('고유한제목검색대상');
  });

  it('본문으로도 찾는다 — HTML 태그가 단어 사이에 끼어도 매치된다', async () => {
    await createPost(adminCookie, '본문검색용글', '<p><strong>볼드</strong> <i>이탤릭</i></p>');

    const res = await search(adminCookie, '볼드 이탤릭');
    const titles = res.body.data.results.map((r: { title: string }) => r.title);
    expect(titles).toContain('본문검색용글');
  });

  it('결과 요약에는 HTML 태그가 남지 않는다', async () => {
    await createPost(adminCookie, '요약태그확인글', '<p><strong>내용이</strong> 있습니다</p>');

    const res = await search(adminCookie, '요약태그확인글');
    const hit = res.body.data.results.find((r: { title: string }) => r.title === '요약태그확인글');
    expect(hit).toBeDefined();
    expect(hit.content).not.toContain('<');
    expect(hit.content).toContain('내용이');
  });

  it('긴 본문 요약은 200자로 잘리고 말줄임을 붙인다', async () => {
    await createPost(adminCookie, '긴본문요약글', `<p>${'가'.repeat(500)}</p>`);

    const res = await search(adminCookie, '긴본문요약글');
    const hit = res.body.data.results.find((r: { title: string }) => r.title === '긴본문요약글');
    expect(hit.content).toHaveLength(203); // 200자 + '...'
    expect(hit.content.endsWith('...')).toBe(true);
  });

  it('비밀글은 작성자 본인에게만 검색된다', async () => {
    const created = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '비밀글검색대상',
        content: '<p>비밀 내용</p>',
        isSecret: true,
        secretType: 'password',
        secretPassword: 'secret1234',
      });
    expect(created.status).toBe(201);

    const owner = await search(adminCookie, '비밀글검색대상');
    expect(owner.body.data.results.map((r: { title: string }) => r.title)).toContain(
      '비밀글검색대상'
    );

    const other = await search(userCookie, '비밀글검색대상');
    expect(other.body.data.results.map((r: { title: string }) => r.title)).not.toContain(
      '비밀글검색대상'
    );
  });

  it('검색어가 2자 미만이면 400', async () => {
    const res = await search(adminCookie, 'a');
    expect(res.status).toBe(400);
  });

  it('검색어가 100자를 넘으면 400', async () => {
    const res = await search(adminCookie, 'a'.repeat(101));
    expect(res.status).toBe(400);
  });

  it('LIKE 와일드카드는 리터럴로 취급한다(전체 매치 방지)', async () => {
    await createPost(adminCookie, '와일드카드테스트', '<p>내용</p>');

    // '%%' 가 이스케이프되지 않으면 모든 글이 매치된다
    const res = await search(adminCookie, '%%');
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([]);
  });

  it('미인증 사용자는 401', async () => {
    const res = await request(app).get('/api/posts/search/global').query({ q: '무엇이든' });
    expect(res.status).toBe(401);
  });
});
