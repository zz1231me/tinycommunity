// server/src/__tests__/allRoutesCrashSweep.test.ts
// 219개 라우트 전부를 훑어 5xx 가 나오는 곳을 찾는다.
//
// 같은 기법을 /api/admin 60개에만 돌렸을 때 두 곳이 걸렸다(없는 사용자를 가리키면
// 404 가 아니라 500). 나머지 159개는 한 번도 훑지 않았다.
//
// 5xx 는 "서버가 잘못했다" 는 뜻이라, 잘못된 요청 때문에 치명 오류 로그가 쌓이면
// 정작 진짜 장애가 묻힌다. 자리표시자 id 와 빈 본문은 누구나 보낼 수 있는 입력이다.
//
// 헛스윕이 되지 않도록 넣은 것들:
//   - 접두사를 하드코딩하지 않고 index.ts 를 파싱한다(파일명이 관례를 벗어난 곳이 있다)
//   - 기능 게이트 8개를 켠다 — 꺼두면 전부 403 이라 아무것도 검사하지 못한다
//   - 모든 요청에 CSRF 헤더를 붙인다 — 없으면 전부 403(CSRF)으로 통과해 버린다
//   - 훑은 수·상태 분포·가장 느린 프로브를 남겨, 통과가 '닿지도 못한 통과' 인지 볼 수 있게 한다
//
// 첫 판에서는 401 이 나올 때마다 재로그인해 다시 시도하게 했다가 219번 × bcrypt 가 되어
// 타임아웃이 났다. 재로그인은 총 횟수를 제한하고, 스윕은 beforeAll 에서 '한 번만' 돈다.

import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Probe = { method: Method; url: string; source: string };
type Result = Probe & { status: number; ms: number; body: string };

const GATED_FEATURES = [
  'post.drafts',
  'tools.calendar',
  'tools.memo',
  'tools.wiki',
  'post.tags',
  'post.report',
  'tools.tempShare',
  'tools.attendance',
];

/** 세션을 되살리는 횟수 상한 — 넘으면 그대로 두고 401 로 기록한다 */
const MAX_RELOGIN = 5;

/**
 * 프로브 하나가 기다리는 시간.
 *
 * 없으면 응답을 끝내지 않는 라우트 하나가 스윕 전체를 세운다. 실제로 그랬다 —
 * /api/notifications/stream 은 SSE(text/event-stream)라 연결을 닫지 않고,
 * 거기서 멈춰 600초 예산을 다 쓰고 진단 한 줄 남기지 못했다.
 */
const PROBE_DEADLINE_MS = 3000;

/**
 * 끝나지 않는 것이 정상인 라우트.
 *
 * 실패로 두지 않되 조용히 넘기지도 않는다 — 아래에서 '멈춘 집합' 이 이 목록과 정확히
 * 같은지 확인한다. 새로 멈추는 라우트가 생기면 그때 드러난다.
 */
const KNOWN_STREAMING = ['/api/notifications/stream'];

function mountedRouteFiles(): Array<{ prefix: string; file: string }> {
  const index = readFileSync(join(__dirname, '../index.ts'), 'utf-8');

  const varToFile = new Map<string, string>();
  for (const m of index.matchAll(/import\s+(\w+)\s+from\s+'\.\/routes\/([\w.]+)'/g)) {
    varToFile.set(m[1], m[2]);
  }

  const out: Array<{ prefix: string; file: string }> = [];
  const mount =
    /app\.use\(\s*'(\/api\/[^']+)'\s*,\s*(?:requireFeature\([^)]*\)\s*,\s*)?(\w+)\s*\)/g;
  for (const m of index.matchAll(mount)) {
    const file = varToFile.get(m[2]);
    if (file) out.push({ prefix: m[1], file });
  }
  return out;
}

function routesIn(file: string): Array<{ method: Method; path: string }> {
  const src = readFileSync(join(__dirname, '../routes', `${file}.ts`), 'utf-8');
  return [...src.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(m => ({
    method: m[1] as Method,
    path: m[2],
  }));
}

const fill = (p: string) => p.replace(/:[A-Za-z0-9_]+/g, 'probe');

function allProbes(): Probe[] {
  const probes: Probe[] = [];
  for (const { prefix, file } of mountedRouteFiles()) {
    for (const r of routesIn(file)) {
      const tail = r.path === '/' ? '' : fill(r.path);
      probes.push({ method: r.method, url: `${prefix}${tail}`, source: `${file}${r.path}` });
    }
  }
  return probes;
}

let cookie = '';
let reloginsLeft = MAX_RELOGIN;
let results: Result[] = [];

beforeAll(async () => {
  await seedTestData();
  for (const key of GATED_FEATURES) {
    await FeatureFlag.destroy({ where: { key } });
    await FeatureFlag.create({ key, enabled: true });
  }
  featureFlagService.invalidate();
  cookie = await loginAs('admin', 'TestAdmin123!');

  const probes = allProbes();
  for (const p of probes) {
    const build = () => {
      const r = request(app)
        [p.method](p.url)
        .set(CSRF_HEADER)
        .set('Cookie', cookie)
        .timeout({ deadline: PROBE_DEADLINE_MS });
      return p.method === 'get' || p.method === 'delete' ? r : r.send({});
    };

    const started = Date.now();
    try {
      let res = await build();
      // 로그아웃 계열이 세션을 날렸을 수 있다. 되살리되 횟수를 제한한다 —
      // 제한이 없으면 매 프로브마다 bcrypt 로그인이 붙어 스윕이 끝나지 않는다.
      if (res.status === 401 && reloginsLeft > 0) {
        reloginsLeft -= 1;
        cookie = await loginAs('admin', 'TestAdmin123!');
        res = await build();
      }
      results.push({
        ...p,
        status: res.status,
        ms: Date.now() - started,
        body: JSON.stringify(res.body ?? {}).slice(0, 120),
      });
    } catch (err) {
      // 기한을 넘긴 프로브. status 0 으로 따로 세어 둔다(5xx 와 섞지 않는다).
      const timedOut = Boolean((err as { timeout?: unknown }).timeout);
      results.push({
        ...p,
        status: timedOut ? 0 : -1,
        ms: Date.now() - started,
        body: timedOut ? 'timeout' : String((err as Error).message).slice(0, 120),
      });
    }
  }

  const dist: Record<number, number> = {};
  for (const r of results) dist[r.status] = (dist[r.status] ?? 0) + 1;
  const summary = Object.entries(dist)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([k, v]) => `${k}:${v}`)
    .join('  ');
  const slowest = [...results]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8)
    .map(r => `${r.ms}ms ${r.method.toUpperCase()} ${r.url}`);

  console.log(`\n  훑은 라우트 ${results.length}개`);
  console.log(`  상태 분포: ${summary}`);
  console.log(`  재로그인: ${MAX_RELOGIN - reloginsLeft}회`);
  console.log(`  가장 느린 곳:\n    ${slowest.join('\n    ')}\n`);
}, 600_000);

describe('전 라우트 훑기', () => {
  it('검사 대상이 충분히 잡힌다 — 0개를 훑고 통과하지 않도록', () => {
    expect(mountedRouteFiles().length).toBeGreaterThan(20);
    expect(results.length).toBeGreaterThan(150);
  });

  it('스윕이 실제로 핸들러까지 닿는다 — 404·401 만 잔뜩 받은 것이 아니다', () => {
    // 2xx(성공) 또는 400/403(핸들러·검증이 내린 판단)은 라우트에 닿았다는 뜻이다
    const reached = results.filter(
      r => r.status < 300 || r.status === 400 || r.status === 403
    ).length;
    expect(reached).toBeGreaterThan(results.length * 0.25);
  });

  it('응답을 끝내지 않는 라우트는 아는 것뿐이다', () => {
    const stalled = results.filter(r => r.status === 0).map(r => r.url);
    // SSE 는 끝나지 않는 것이 정상이다. 다만 목록에 없는 것이 멈추기 시작하면 여기서 걸린다.
    expect(stalled.sort()).toEqual(KNOWN_STREAMING.sort());
  });

  it('요청 자체가 실패한 프로브는 없다 — 타임아웃 외의 오류', () => {
    const errored = results.filter(r => r.status === -1).map(r => `${r.url}: ${r.body}`);
    expect(errored).toEqual([]);
  });

  it('어떤 라우트도 5xx 로 무너지지 않는다', () => {
    const crashed = results
      .filter(r => r.status >= 500)
      .map(r => `${r.method.toUpperCase()} ${r.url}  (${r.source})  → ${r.status} ${r.body}`);
    expect(crashed).toEqual([]);
  });
});
