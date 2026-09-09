import request from 'supertest';
import { app, seedTestData } from './helpers';

// CORS 는 교차 출처를 위한 장치다. 그런데 프로덕션에서는 Express 가 client/dist 를
// 직접 서빙하므로 화면과 API 가 같은 출처이고, 그때 브라우저가 보내는 Origin 은
// 서버 자신의 주소다. 허용 목록에 그 주소가 없으면 서버가 자기 화면을 막는다 —
// 빌드를 띄웠더니 /assets/*.css 가 전부 403 이 되어 흰 화면이 떴다.
//
// 포트를 나열해 막는 방식은 배포 주소에서 또 깨진다. 요청이 들어온 Host 와 비교한다.

beforeAll(async () => {
  await seedTestData();
});

describe('CORS', () => {
  it('서버 자신의 주소에서 온 요청은 막지 않는다', async () => {
    const res = await request(app)
      .get('/api/site-settings')
      .set('Host', 'tinycommunity.example.com')
      .set('Origin', 'https://tinycommunity.example.com');

    expect(res.status).toBe(200);
  });

  it('포트가 붙은 자기 주소도 같은 출처로 본다', async () => {
    const res = await request(app)
      .get('/api/site-settings')
      .set('Host', 'localhost:4000')
      .set('Origin', 'http://localhost:4000');

    expect(res.status).toBe(200);
  });

  it('프록시 뒤에서 프로토콜이 달라도 통과한다 — https 화면 → http 내부 홉', async () => {
    const res = await request(app)
      .get('/api/site-settings')
      .set('Host', 'intranet.local')
      .set('Origin', 'https://intranet.local');

    expect(res.status).toBe(200);
  });

  it('남의 출처는 여전히 막는다', async () => {
    const res = await request(app)
      .get('/api/site-settings')
      .set('Host', 'tinycommunity.example.com')
      .set('Origin', 'https://evil.example.net');

    expect(res.status).toBe(403);
  });

  it('Origin 이 없는 요청(서버 간 호출·curl)은 통과한다', async () => {
    const res = await request(app).get('/api/site-settings');
    expect(res.status).toBe(200);
  });

  it('허용 목록(사설망)은 그대로 동작한다', async () => {
    const res = await request(app)
      .get('/api/site-settings')
      .set('Host', 'tinycommunity.example.com')
      .set('Origin', 'http://192.168.0.10:8080');

    expect(res.status).toBe(200);
  });
});
