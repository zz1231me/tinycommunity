import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { SiteSettings } from '../models/SiteSettings';
import { refreshSettingsCache } from '../utils/settingsCache';
import { DUEL_DEFAULTS } from '../config/duel';

// 대결 판돈의 아래위가 뒤집히지 않게 막는 가드.
//
// 이 스위트는 반드시 '관리자 화면이 부르는 그 경로'(PUT /api/site-settings)로 들어간다.
// pointRulesSettings.test.ts 는 SiteSettings.update 를 직접 불러 컨트롤러를 건너뛰므로,
// 가드가 통째로 없어져도 그 스위트는 초록이다.
//
// 이 가드는 한 번 틀린 적이 있다. 처음 판은 (1) 저장된 값이 아니라 코드 기본값과
// 비교했고 (2) 보내온 값끼리 비교했는데, 실제 저장은 intOrKeep 이 범위 밖 값을 조용히
// 버리므로 검사한 쌍과 저장되는 쌍이 달랐다. 그래서 두 구멍을 각각 고정한다.

let adminCookie: string;

const put = (body: Record<string, unknown>) =>
  request(app).put('/api/site-settings').set(CSRF_HEADER).set('Cookie', adminCookie).send(body);

const read = () => request(app).get('/api/site-settings');

/** 컨트롤러를 거치지 않고 직접 세운다 — '이미 저장돼 있던 값' 을 만들기 위해서다 */
async function store(patch: Record<string, number>) {
  await SiteSettings.update(patch, { where: {} });
  await refreshSettingsCache();
}

async function restoreDefaults() {
  await store({
    duelMinStake: DUEL_DEFAULTS.minStake,
    duelMaxStake: DUEL_DEFAULTS.maxStake,
  });
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

beforeEach(restoreDefaults);
afterAll(restoreDefaults);

describe('대결 판돈 뒤집힘 방지', () => {
  it('한쪽만 바꿔도 저장된 값과 견준다 — 기본값과 견주면 뒤집힘을 놓친다', async () => {
    // 이미 최소가 5,000 인 상태에서 최대만 2,000 으로 낮춘다.
    // 코드 기본값(최소 10)과 비교하던 예전 판에서는 10 > 2000 이 거짓이라 통과했고,
    // 그 뒤로는 어떤 금액도 걸 수 없었다.
    await store({ duelMinStake: 5000, duelMaxStake: 9000 });

    const res = await put({ duelMaxStake: 2000 });
    expect(res.status).toBe(400);

    const after = await read();
    expect(after.body.data.duelMinStake).toBe(5000);
    expect(after.body.data.duelMaxStake).toBe(9000);
  });

  it('범위를 벗어나 버려질 값에 속지 않는다', async () => {
    // 최대 2,000,000 은 상한(1,000,000)을 넘어 intOrKeep 이 조용히 버리고 옛 값을 남긴다.
    // 보내온 값끼리만 보면 50,000 < 2,000,000 이라 통과해 버리고,
    // 저장된 결과는 최소 50,000 / 최대 10,000 으로 뒤집힌다.
    const res = await put({ duelMinStake: 50000, duelMaxStake: 2000000 });
    expect(res.status).toBe(400);

    const after = await read();
    expect(after.body.data.duelMinStake).toBe(DUEL_DEFAULTS.minStake);
    expect(after.body.data.duelMaxStake).toBe(DUEL_DEFAULTS.maxStake);
  });

  it('최소만 올려도 저장된 최대와 견준다 — 멀쩡한 값을 거절하지 않는다', async () => {
    // 저장된 최대가 500,000 인데 기본값(10,000)과 비교하면 이 요청이 까닭 없이 거절된다.
    await store({ duelMinStake: 10, duelMaxStake: 500000 });

    const res = await put({ duelMinStake: 200000 });
    expect(res.status).toBe(200);

    const after = await read();
    expect(after.body.data.duelMinStake).toBe(200000);
    expect(after.body.data.duelMaxStake).toBe(500000);
  });

  it('제대로 된 범위는 그대로 저장된다', async () => {
    const res = await put({ duelMinStake: 100, duelMaxStake: 500 });
    expect(res.status).toBe(200);

    const after = await read();
    expect(after.body.data.duelMinStake).toBe(100);
    expect(after.body.data.duelMaxStake).toBe(500);
  });

  it('같은 값끼리는 막지 않는다 — 한 금액만 걸게 하는 것도 설정이다', async () => {
    const res = await put({ duelMinStake: 300, duelMaxStake: 300 });
    expect(res.status).toBe(200);
    expect((await read()).body.data.duelMinStake).toBe(300);
  });
});

describe('관리자만 바꾼다', () => {
  it('로그인하지 않으면 설정을 바꿀 수 없다', async () => {
    const res = await request(app)
      .put('/api/site-settings')
      .set(CSRF_HEADER)
      .send({ duelMinStake: 1 });
    expect([401, 403]).toContain(res.status);
    expect((await read()).body.data.duelMinStake).toBe(DUEL_DEFAULTS.minStake);
  });
});
