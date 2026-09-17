// server/src/__tests__/boundaryMatrix.test.ts
// 경계값을 기계적으로 밀어 넣어 본다.
//
// 노리는 것은 "거절되는가" 가 아니라 "어떻게 거절되는가" 다. 상한을 넘긴 입력이 400 이 아니라
// 500 으로 나가면, 그건 검증이 없어서 모델·DB 까지 내려갔다는 뜻이다. 실제로 이 저장소에서
// 296자 이메일이 공개 회원가입 경로에서 500 + critical 에러로그를 만든 적이 있다.
// 라우트 219개 중 zod 검증기가 붙은 것은 12개뿐이라, 나머지는 모두 이 사각지대 후보다.
//
// 그래서 모든 사례에 공통으로 거는 단언은 하나다 — 5xx 는 나오지 않는다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

let cookie = '';
let postId = '';

/** 경계 주변에서 흔히 깨지는 값들 */
const NUL = String.fromCharCode(0);
const EMOJI = '😀';

async function enableFeature(key: string) {
  await FeatureFlag.destroy({ where: { key } });
  await FeatureFlag.create({ key, enabled: true });
  featureFlagService.invalidate();
}

beforeAll(async () => {
  await seedTestData();
  cookie = await loginAs('admin', 'TestAdmin123!');
  await enableFeature('tools.memo');

  const post = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title: `경계 테스트 ${Date.now()}`, content: '<p>x</p>' });
  expect(post.status).toBe(201);
  postId = post.body.data.id;
});

/** 5xx 는 어떤 입력에도 나오면 안 된다 — 이 단언이 이 파일의 핵심이다 */
function expectNoServerError(status: number, label: string) {
  if (status >= 500) {
    throw new Error(`${label} → HTTP ${status} (5xx 는 입력 검증 실패의 신호다)`);
  }
}

// ─── 메모: 제목 200, 본문 10000 ────────────────────────────────────

describe('메모 경계값', () => {
  const cases: Array<[string, Record<string, unknown>, 'accept' | 'reject']> = [
    ['제목 정확히 200자', { title: 'ㄱ'.repeat(200), content: 'x' }, 'accept'],
    ['제목 201자', { title: 'ㄱ'.repeat(201), content: 'x' }, 'reject'],
    ['본문 정확히 10000자', { title: 't', content: 'x'.repeat(10000) }, 'accept'],
    ['본문 10001자', { title: 't', content: 'x'.repeat(10001) }, 'reject'],
    ['제목·본문 모두 빈 값', { title: '', content: '' }, 'reject'],
    ['제목·본문 모두 공백만', { title: '   ', content: '   ' }, 'reject'],
    ['제목 경계에 이모지', { title: 'ㄱ'.repeat(199) + EMOJI, content: 'x' }, 'accept'],
    ['제목에 널바이트', { title: `a${NUL}b`, content: 'x' }, 'reject'],
    ['색상이 허용 목록 밖', { title: 't', content: 'x', color: 'chartreuse' }, 'reject'],
  ];

  it.each(cases)('%s', async (label, body, expected) => {
    const res = await request(app)
      .post('/api/memos')
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .send(body);

    expectNoServerError(res.status, `메모/${label}`);
    if (expected === 'accept') {
      expect(res.status).toBeLessThan(300);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });
});

// ─── 댓글: parentId 정수 상한 ──────────────────────────────────────

describe('댓글 경계값', () => {
  const cases: Array<[string, Record<string, unknown>, 'accept' | 'reject']> = [
    ['정상 내용', { content: '안녕' }, 'accept'],
    ['빈 내용', { content: '' }, 'reject'],
    ['parentId 가 INT 상한', { content: 'x', parentId: 2147483647 }, 'reject'], // 그런 부모는 없다
    ['parentId 가 INT 상한 초과', { content: 'x', parentId: 2147483648 }, 'reject'],
    ['parentId 가 문자열 상한 초과', { content: 'x', parentId: '99999999999999' }, 'reject'],
    ['parentId 가 음수', { content: 'x', parentId: -1 }, 'reject'],
    ['parentId 가 0', { content: 'x', parentId: 0 }, 'reject'],
    ['parentId 가 숫자가 아님', { content: 'x', parentId: 'abc' }, 'reject'],
    ['내용에 널바이트', { content: `a${NUL}b` }, 'reject'],
  ];

  it.each(cases)('%s', async (label, body, expected) => {
    const res = await request(app)
      .post(`/api/comments/notice/${postId}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .send(body);

    expectNoServerError(res.status, `댓글/${label}`);
    if (expected === 'accept') {
      expect(res.status).toBeLessThan(300);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });
});

// ─── 회원가입: 공개 경로라 5xx 가 특히 위험하다 ────────────────────

describe('회원가입 경계값 (공개 경로)', () => {
  const uniq = () => `u${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 20);

  const cases: Array<[string, () => Record<string, unknown>]> = [
    ['아이디 3자 (최소 미만)', () => ({ id: 'abc', password: 'Passw0rd!', name: '이름' })],
    [
      '아이디 21자 (최대 초과)',
      () => ({ id: 'a'.repeat(21), password: 'Passw0rd!', name: '이름' }),
    ],
    ['아이디에 한글', () => ({ id: '한글아이디', password: 'Passw0rd!', name: '이름' })],
    ['아이디에 널바이트', () => ({ id: `ab${NUL}cd`, password: 'Passw0rd!', name: '이름' })],
    ['이름 51자', () => ({ id: uniq(), password: 'Passw0rd!', name: 'ㄱ'.repeat(51) })],
    [
      '이메일 101자',
      () => ({
        id: uniq(),
        password: 'Passw0rd!',
        name: '이름',
        email: `${'a'.repeat(90)}@example.com`,
      }),
    ],
    [
      '이메일 296자 (과거 500 을 내던 값)',
      () => ({
        id: uniq(),
        password: 'Passw0rd!',
        name: '이름',
        email: `${'a'.repeat(280)}@example.com`,
      }),
    ],
    ['비밀번호 101자', () => ({ id: uniq(), password: 'a'.repeat(101), name: '이름' })],
    [
      '비밀번호가 73바이트 (bcrypt 상한 초과)',
      () => ({
        id: uniq(),
        password: 'a'.repeat(73),
        name: '이름',
      }),
    ],
    ['본문이 비어 있음', () => ({})],
  ];

  it.each(cases)('%s 는 4xx 로 거절된다', async (label, make) => {
    const res = await request(app).post('/api/auth/register').set(CSRF_HEADER).send(make());

    expectNoServerError(res.status, `가입/${label}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ─── 목록 조회의 페이지네이션: 음수·거대값·문자 ────────────────────

describe('페이지네이션 경계값', () => {
  const values = ['-1', '0', '1', '99999999', '2147483648', 'abc', '', '1e10', '1.5'];

  it.each(values)('page=%s 로도 5xx 가 나지 않는다', async page => {
    const res = await request(app)
      .get(`/api/posts/by-type/notice?page=${encodeURIComponent(page)}&limit=5`)
      .set('Cookie', cookie);
    expectNoServerError(res.status, `목록/page=${page}`);
  });

  it.each(values)('limit=%s 로도 5xx 가 나지 않는다', async limit => {
    const res = await request(app)
      .get(`/api/posts/by-type/notice?page=1&limit=${encodeURIComponent(limit)}`)
      .set('Cookie', cookie);
    expectNoServerError(res.status, `목록/limit=${limit}`);
  });
});
