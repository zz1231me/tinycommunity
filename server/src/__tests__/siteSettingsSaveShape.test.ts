import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';

// 저장 응답은 관리자 조회와 **같은 모양** 이어야 한다.
//
// 저장 응답으로 폼을 덮어쓰는데(SiteSettingsManagement), 공개용 모양만 돌려주던 때는
// 보안 설정 아홉 개가 빠져 있었다. 그래서 저장 직후 '보안 고급 설정'·'시스템 설정' 의
// 칸들이 비어 보였다 — 값이 지워진 것처럼.
//
// 서버는 받지 않은 값을 그대로 두므로(intOrKeep) DB 가 망가지지는 않았다. 화면만
// 거짓말을 했다. 그래서 '저장했는데 값이 안 보인다' 가 되었다.

let adminCookie: string;

const ADMIN_ONLY = [
  'maxLoginAttempts',
  'accountLockMinutes',
  'bcryptRounds',
  'securityLogRetentionDays',
  'errorLogRetentionDays',
  'deletedPostRetentionDays',
  'jwtAccessTokenHours',
  'jwtRefreshTokenDays',
  'passwordResetTokenHours',
];

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

describe('사이트 설정 저장 응답', () => {
  it('관리자 조회와 키가 완전히 같다', async () => {
    const got = await request(app).get('/api/site-settings/admin').set('Cookie', adminCookie);
    expect(got.status).toBe(200);

    const saved = await request(app)
      .put('/api/site-settings')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ siteName: got.body.data.siteName });
    expect(saved.status).toBe(200);

    // 한쪽에만 있는 키가 하나라도 있으면 화면이 그 칸을 잃는다.
    expect(Object.keys(saved.body.data).sort()).toEqual(Object.keys(got.body.data).sort());
  });

  it('보안 설정 아홉 개가 저장 응답에 그대로 실린다', async () => {
    const res = await request(app)
      .put('/api/site-settings')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ maxLoginAttempts: 7 });
    expect(res.status).toBe(200);

    for (const key of ADMIN_ONLY) {
      expect(res.body.data[key]).toBeDefined();
    }
    expect(res.body.data.maxLoginAttempts).toBe(7);
  });

  it('공개 조회에는 여전히 보안 설정이 없다', async () => {
    const res = await request(app).get('/api/site-settings');
    expect(res.status).toBe(200);
    for (const key of ADMIN_ONLY) {
      expect(res.body.data[key]).toBeUndefined();
    }
  });
});
