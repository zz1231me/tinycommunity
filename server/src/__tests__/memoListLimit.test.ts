import request from 'supertest';
import { app, seedTestData, loginAs } from './helpers';
import { Memo } from '../models/Memo';
import { SiteSettings } from '../models/SiteSettings';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { refreshSettingsCache } from '../utils/settingsCache';
import { SETTINGS_DEFAULTS } from '../utils/settingsCache';

// 메모 목록의 상한.
//
// 만들 수 있는 개수(memoMaxPerUser, 관리자가 최대 2000 까지 올릴 수 있다)와 목록이
// 돌려주는 개수가 서로 달랐다. 목록은 500 으로 못 박혀 있어서, 상한을 그보다 크게
// 올리면 그 너머의 메모는 만들어지기만 하고 목록에는 영영 나오지 않았다 —
// 화면에서 열 수도, 지울 수도 없는 메모가 된다.
//
// 그래서 '많이 만들어 두고 실제로 다 돌려주는지' 를 본다. 적은 수로 확인하면
// 고치기 전에도 통과해 아무것도 증명하지 못한다.

const USER = 'testuser';
let cookie: string;

const list = () => request(app).get('/api/memos').set('Cookie', cookie);

async function setMax(value: number) {
  await SiteSettings.update({ memoMaxPerUser: value }, { where: {} });
  await refreshSettingsCache();
}

/** API 를 거치지 않고 한꺼번에 만든다 — 여기서 보려는 것은 목록 쪽 상한이다 */
async function seedMemos(count: number) {
  await Memo.destroy({ where: { UserId: USER } });
  await Memo.bulkCreate(
    Array.from({ length: count }, (_, i) => ({
      UserId: USER,
      title: `메모 ${i}`,
      content: `내용 ${i}`,
    }))
  );
}

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'tools.memo' } });
  await FeatureFlag.create({ key: 'tools.memo', enabled: true });
  featureFlagService.invalidate();
  cookie = await loginAs(USER, 'TestUser123!');
});

afterAll(async () => {
  await Memo.destroy({ where: { UserId: USER } });
  // 다른 스위트가 기본값을 전제로 돈다
  await setMax(SETTINGS_DEFAULTS.memoMaxPerUser);
});

describe('메모 목록 상한은 만들 수 있는 상한을 따라간다', () => {
  it('상한을 500 보다 크게 올리면 그 너머의 메모도 목록에 나온다', async () => {
    // 고치기 전에는 목록이 500 에서 잘려, 501번째부터는 존재하지만 보이지 않았다
    await setMax(1000);
    await seedMemos(520);

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(520);
  });

  it('상한을 내리면 목록도 그만큼만 준다 — 무제한 조회가 되지는 않는다', async () => {
    // 상한을 따라가게 만든다고 해서 '전부 다 준다' 가 되면 안 된다
    await setMax(50);
    await seedMemos(120);

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(50);
  });

  it('상한보다 적게 있으면 있는 만큼만 준다', async () => {
    await setMax(1000);
    await seedMemos(3);

    const res = await list();
    expect(res.body.data).toHaveLength(3);
  });
});
