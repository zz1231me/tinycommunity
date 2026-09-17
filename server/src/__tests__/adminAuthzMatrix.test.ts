// server/src/__tests__/adminAuthzMatrix.test.ts
// 관리자 API × 역할 전수 대조.
//
// 기존 authzSweep 은 admin.routes.ts 의 GET 만, 그리고 비로그인·일반 사용자만 훑는다.
// 관리자 라우트 60개 중 절반이 쓰기(POST·PUT·PATCH·DELETE)이고, 역할도 매니저·게스트가
// 남아 있다. 권한이 새면 가장 아픈 쪽이 바로 그 빈틈이다.
//
// 설계에서 중요한 점 하나: 비-GET 에 CSRF 헤더를 붙이지 않으면 전부 CSRF 로 403 이 되어
// "인가를 검사하지 않고도 통과하는" 헛테스트가 된다. 모든 요청에 CSRF 헤더를 붙여
// 거절의 이유가 인가이도록 만든다.

import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { User } from '../models/User';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Route = { method: Method; path: string };

/** admin.routes.ts 에서 라우트를 전부 뽑는다(메서드 포함) */
function adminRoutes(): Route[] {
  const file = readFileSync(join(__dirname, '../routes/admin.routes.ts'), 'utf-8');
  const matches = file.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g);
  return [...matches].map(m => ({ method: m[1] as Method, path: m[2] }));
}

/** :id 같은 자리표시자를 아무 값으로 채운다 */
const fill = (p: string) => p.replace(/:[A-Za-z0-9_]+/g, 'probe');

const PASSWORD = 'MatrixTest123!';

async function ensureUser(id: string, roleId: string) {
  const found = await User.findByPk(id);
  if (!found) {
    await User.create({
      id,
      password: PASSWORD,
      name: `${roleId} 테스트`,
      email: `${id}@test.com`,
      roleId,
      isActive: true,
    });
  }
}

const cookies: Record<string, string> = {};

beforeAll(async () => {
  await seedTestData();
  await ensureUser('mx_manager', 'manager');
  await ensureUser('mx_guest', 'guest');
  await ensureUser('mx_user', 'user');

  cookies.manager = await loginAs('mx_manager', PASSWORD);
  cookies.guest = await loginAs('mx_guest', PASSWORD);
  cookies.user = await loginAs('mx_user', PASSWORD);
  cookies.admin = await loginAs('admin', 'TestAdmin123!');
});

function send(route: Route, cookie?: string) {
  const req = request(app)
    [route.method](`/api/admin${fill(route.path)}`)
    .set(CSRF_HEADER);
  if (cookie) req.set('Cookie', cookie);
  // 쓰기 요청은 본문이 비어도 된다 — 인가에서 막히는지만 본다
  return route.method === 'get' || route.method === 'delete' ? req : req.send({});
}

describe('검사 대상이 실제로 잡히는가', () => {
  it('관리자 라우트를 충분히 찾아낸다 — 0개를 훑고 통과하지 않도록', () => {
    const routes = adminRoutes();
    expect(routes.length).toBeGreaterThan(40);
    // 쓰기 라우트도 포함되어야 한다(기존 스윕은 GET 만 봤다)
    expect(routes.some(r => r.method !== 'get')).toBe(true);
  });
});

describe.each([
  ['비로그인', undefined],
  ['게스트', 'guest'],
  ['일반 사용자', 'user'],
  ['매니저', 'manager'],
])('%s 는 관리자 API 에 닿지 못한다', (_label, roleKey) => {
  it('어떤 관리자 라우트도 2xx 를 돌려주지 않는다', async () => {
    const leaked: string[] = [];
    for (const route of adminRoutes()) {
      const res = await send(route, roleKey ? cookies[roleKey] : undefined);
      if (res.status >= 200 && res.status < 300) {
        leaked.push(`${route.method.toUpperCase()} ${route.path} → ${res.status}`);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('어떤 관리자 라우트도 5xx 로 무너지지 않는다', async () => {
    const crashed: string[] = [];
    for (const route of adminRoutes()) {
      const res = await send(route, roleKey ? cookies[roleKey] : undefined);
      if (res.status >= 500) {
        crashed.push(`${route.method.toUpperCase()} ${route.path} → ${res.status}`);
      }
    }
    expect(crashed).toEqual([]);
  });
});

// 위 describe.each 는 비관리자 역할만 5xx 를 검사했다. 정작 라우트 안쪽까지 들어가는 것은
// 관리자이므로, 무너지는 곳이 있다면 거기서 드러난다 — 실제로 두 곳이 그랬다.
describe('관리자로 들어가도 무너지지 않는다', () => {
  it('없는 대상을 가리켜도 5xx 가 아니라 4xx 로 답한다', async () => {
    const crashed: string[] = [];
    for (const route of adminRoutes()) {
      const res = await send(route, cookies.admin);
      if (res.status >= 500) {
        const msg = JSON.stringify(res.body ?? {}).slice(0, 120);
        crashed.push(`${route.method.toUpperCase()} ${route.path} → ${res.status} ${msg}`);
      }
    }
    expect(crashed).toEqual([]);
  });
});

describe('양성 대조 — 검사가 라우트에 실제로 닿는다', () => {
  it('관리자는 조회 라우트에서 403 을 받지 않는다', async () => {
    const forbidden: string[] = [];
    for (const route of adminRoutes().filter(r => r.method === 'get')) {
      const res = await send(route, cookies.admin);
      if (res.status === 403) forbidden.push(`${route.path} → 403`);
    }
    // 위 'leaked 가 비었다' 가 경로 오타 때문에 통과한 것이 아님을 보인다
    expect(forbidden).toEqual([]);
  });
});
