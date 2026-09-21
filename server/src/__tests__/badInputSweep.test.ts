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
import { clampText } from '../utils/clamp';

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

describe('열 너비·이모지 경계', () => {
  // 파일 이름을 이모지 한가운데에서 자르면 짝이 깨져, 받을 때 encodeURIComponent 가 터진다.
  // 실제 내려받기는 진짜 첨부가 있어야 닿는 길이라, 자르는 방법 자체를 고정한다.
  it('255자에서 자를 때 이모지 짝을 깨지 않는다', () => {
    const name = 'ㅇ'.repeat(254) + '😀'; // 256 자리 — 255 에서 자르면 짝이 반만 남는다

    expect(() => encodeURIComponent(name.substring(0, 255))).toThrow(); // 예전 방법
    expect(() => encodeURIComponent(clampText(name, 255))).not.toThrow(); // 지금 방법
    expect(clampText(name, 255).length).toBeLessThanOrEqual(255);
  });
});

describe('형이 다른 관리 입력', () => {
  it('신고 처리 메모가 객체여도 넘어지지 않는다', async () => {
    // 없는 신고라도 형 검사가 먼저다 — 400 이어야 한다(검사가 없으면 404 로 지나간다)
    const res = await request(app)
      .patch('/api/reports/99999/review')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ status: 'reviewed', reviewNote: { a: 1 } });

    expect(res.status).toBe(400);
  });

  it("이름에 객체를 보내면 거절한다 — '[object Object]' 로 저장되지 않는다", async () => {
    const res = await request(app)
      .put('/api/admin/users/testuser')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ name: { a: 1 } });

    expect(res.status).toBe(400);
    const after = await request(app)
      .get('/api/admin/users?search=testuser')
      .set('Cookie', adminCookie);
    expect(JSON.stringify(after.body)).not.toContain('[object Object]');
  });
});

describe('보안 로그 날짜 거르기', () => {
  // 잘못된 날짜는 조건에서 빼야 한다 — 그대로 넣으면 '거른 것처럼 보이지만 안 걸러진' 목록이 온다
  it('말이 안 되는 날짜를 줘도 넘어지지 않는다', async () => {
    const res = await request(app)
      .get('/api/admin/security-logs?startDate=abc&endDate=2026-13-45')
      .set('Cookie', adminCookie);
    notCrashed(res.status);
  });
});
