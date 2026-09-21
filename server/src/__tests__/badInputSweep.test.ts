// server/src/__tests__/badInputSweep.test.ts
// 이상한 입력에 서버가 500 으로 넘어지지 않는가.
//
// allRoutesCrashSweep 은 '모든 경로에 빈 몸통' 을 한 번씩 던진다. 여기서는 그 그물에 걸리지
// 않는 것들을 본다: 쿼리 문자열, 같은 이름이 두 번 온 쿼리, 형이 다른 몸통 값, 아주 큰 수,
// 퍼센트 기호. 500 은 '서버가 예상하지 못한 것' 이라는 뜻이라, 사용자 입력으로는 나오면 안 된다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

let cookie = '';
let adminCookie = '';

beforeAll(async () => {
  await seedTestData();
  cookie = await loginAs('testuser', 'TestUser123!');
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  // 포인트 기능을 켜 둔다 — 꺼져 있으면 403 이라 '넘어지지 않았다' 가 아무것도 증명하지 못한다
  await FeatureFlag.destroy({ where: { key: 'tools.lottery' } });
  await FeatureFlag.create({ key: 'tools.lottery', enabled: true });
  featureFlagService.invalidate();
});

/** 500 만 아니면 된다 — 400·403·404 는 '알아듣고 돌려보낸 것' 이라 정상이다 */
const notCrashed = (status: number) => expect(status).toBeLessThan(500);

describe('아주 큰 페이지 번호', () => {
  // page * limit 이 1e21 을 넘으면 offset 이 '3e+22' 같은 지수 표기로 질의에 실려 DB 가 거절했다
  it('포인트 내역 — 22자리 페이지에도 넘어지지 않는다', async () => {
    const res = await request(app)
      .get('/api/points/history?page=1000000000000000000000')
      .set('Cookie', cookie);
    expect(res.status).toBe(200); // 기능이 켜져 있으므로 정상 응답이어야 한다(403 이면 검사가 헛돈다)
  });

  it('신고 목록 — 같은 경우', async () => {
    const res = await request(app)
      .get('/api/reports?page=1000000000000000000000')
      .set('Cookie', adminCookie);
    notCrashed(res.status);
  });

  it('보안 로그·출퇴근 기록 — 같은 경우', async () => {
    notCrashed(
      (
        await request(app)
          .get('/api/admin/security-logs?page=1000000000000000000000')
          .set('Cookie', adminCookie)
      ).status
    );
    notCrashed(
      (
        await request(app)
          .get('/api/admin/attendance/records?page=1000000000000000000000')
          .set('Cookie', adminCookie)
      ).status
    );
  });
});

describe('경로에 퍼센트 기호', () => {
  // Express 5 는 경로 조각을 이미 풀어서 준다. 한 번 더 풀면 '%' 하나에도 URIError 가 났다.
  it.each(['/api/uploads/download/%25', '/api/uploads/thumb/%25', '/api/uploads/info/%25'])(
    '%s — 넘어지지 않는다',
    async path => {
      const res = await request(app).get(path).set('Cookie', cookie);
      notCrashed(res.status);
    }
  );
});

describe('같은 이름의 쿼리가 두 번', () => {
  // Express 는 배열을 준다 — .trim 을 부르면 터졌다
  it('사용자 검색', async () => {
    const res = await request(app).get('/api/users/search?q=a&q=b').set('Cookie', cookie);
    notCrashed(res.status);
  });

  it('게시판까지 두 번', async () => {
    const res = await request(app)
      .get('/api/users/search?q=x&boardType=a&boardType=b')
      .set('Cookie', cookie);
    notCrashed(res.status);
  });
});

describe('형이 다른 몸통 값', () => {
  it('비밀글 비밀번호가 숫자', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({
        title: '형이 다른 비밀번호',
        content: '<p>x</p>',
        isSecret: true,
        secretType: 'password',
        secretPassword: 12345678,
      });
    notCrashed(res.status);
  });

  it('위키 슬러그·제목이 숫자', async () => {
    notCrashed(
      (
        await request(app)
          .post('/api/wiki')
          .set(CSRF_HEADER)
          .set('Cookie', adminCookie)
          .send({ slug: 123, title: 'x', content: 'y' })
      ).status
    );
    notCrashed(
      (
        await request(app)
          .post('/api/wiki')
          .set(CSRF_HEADER)
          .set('Cookie', adminCookie)
          .send({ slug: 'ok-slug', title: 123, content: 'y' })
      ).status
    );
  });
});

describe('달 표기', () => {
  // '2026-13' 은 정규식만 통과해, 아무것도 걸리지 않는 조건이 되어 조용히 빈 결과를 줬다
  it('없는 달을 물으면 이번 달로 돌려준다 — 있지도 않은 달을 그대로 돌려주지 않는다', async () => {
    const res = await request(app)
      .get('/api/attendance/me/history?month=2026-13')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.month).not.toBe('2026-13');
  });

  it('제대로 된 달은 그대로 쓴다 — 대조', async () => {
    const res = await request(app)
      .get('/api/attendance/me/history?month=2026-03')
      .set('Cookie', cookie);
    expect(res.body.data.month).toBe('2026-03');
  });
});
