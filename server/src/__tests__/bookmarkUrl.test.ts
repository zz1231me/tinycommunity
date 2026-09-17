import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';

// 사이드바 북마크 주소.
//
// 관리자가 'example.com' 처럼 스킴 없이 적을 수 있어야 하지만, 그 편의를 위해
// 무조건 앞에 https:// 를 붙이면 검사가 무의미해진다 — 붙였으니 언제나 https 다.
// 그래서 '/admin' 이 'https:///admin' 으로, 'mailto:a@b.c' 가 'https://mailto:a@b.c' 로
// 조용히 저장돼, 눌러도 아무 데도 가지 않는 링크가 사이드바에 남았다.

let adminCookie: string;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

function create(url: string) {
  return request(app)
    .post('/api/bookmarks')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ name: `북마크 ${Date.now()}${Math.random()}`, url });
}

describe('받아들이는 주소', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['https://example.com/path', 'https://example.com/path'],
    ['http://example.com', 'http://example.com/'],
    // 사내 도구는 점 없는 호스트 이름을 쓴다 — 막으면 안 된다
    ['intranet', 'https://intranet/'],
    ['localhost:3000', 'https://localhost:3000/'],
  ])('%s → %s', async (input, stored) => {
    const res = await create(input);
    expect(res.status).toBe(201);
    expect(res.body.data.url).toBe(stored);
  });
});

describe('거절하는 주소', () => {
  it.each([
    ['/admin'], // 현재 사이트 기준 경로 — 전체 주소가 아니다
    ['//evil.example.com'], // 프로토콜 상대 주소
    ['#frag'],
    ['?q=1'],
    ['mailto:a@b.c'],
    ['ftp://x.com'],
    ['file:///etc/passwd'],
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['  javascript:alert(1)'],
    ['vbscript:msgbox(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    [''],
    ['   '],
  ])('%s 는 거절한다', async input => {
    expect((await create(input)).status).toBe(400);
  });
});
