import request from 'supertest';
import { app, seedTestData, loginAs } from './helpers';

// 주소에 널 바이트가 섞인 요청.
//
// 그냥 두면 조회 한복판에서 DB 가 거절해 500 이 나간다. 500 은 "서버가 잘못했다" 는
// 뜻이라, 잘못된 요청 때문에 오류 로그가 쌓이고 정작 진짜 장애가 묻힌다.
// id 를 받는 모든 경로가 같은 방식으로 무너지므로 입구에서 한 번 막는다.

let cookie: string;

beforeAll(async () => {
  await seedTestData();
  cookie = await loginAs('admin', 'TestAdmin123!');
});

describe('널 바이트가 섞인 주소', () => {
  const paths = [
    '/api/posts/notice/%00',
    '/api/posts/notice/%00/activity',
    '/api/posts/notice/%00/readers',
    '/api/posts/notice/%00/tags',
    '/api/comments/notice/%00',
  ];

  it.each(paths)('%s → 400 (500 이 아니라)', async path => {
    const res = await request(app).get(path).set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('쿼리에 섞여도 막는다', async () => {
    const res = await request(app).get('/api/posts/notice?search=%00').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('멀쩡한 요청은 그대로 통과한다', async () => {
    const res = await request(app).get('/api/posts/notice').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('퍼센트 기호가 들어간 검색어는 막지 않는다 — %00 만 문제다', async () => {
    const res = await request(app).get('/api/posts/notice?search=%2550').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
