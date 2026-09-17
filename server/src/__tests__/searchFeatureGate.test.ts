// server/src/__tests__/searchFeatureGate.test.ts
// 꺼 둔 기능이 전역 검색으로 새어 나오지 않는지.
//
// 위키·메모·일정의 API 는 마운트 지점에서 requireFeature 로 막힌다(index.ts).
// 그런데 전역 검색은 search.global 하나만 통과하면 되므로, 스위치를 꺼도 제목과
// 본문 요약이 결과에 그대로 실려 나왔다 — 눌러서 들어가면 403 이 뜨는데도.

import { seedTestData } from './helpers';
import { globalSearch } from '../services/postSearch.service';
import { featureFlagService } from '../services/featureFlag.service';
import { FeatureFlag } from '../models/FeatureFlag';
import { WikiPage } from '../models/WikiPage';
import { Memo } from '../models/Memo';
import { User } from '../models/User';

const TERM = 'zzprobeterm';
const SLUG = 'search-gate-probe';

async function setFeature(key: string, enabled: boolean) {
  await FeatureFlag.destroy({ where: { key } });
  await FeatureFlag.create({ key, enabled });
  featureFlagService.invalidate();
}

let admin: { id: string; role: string };

const search = () => globalSearch({ userId: admin.id, userRole: admin.role, searchTerm: TERM });
const titlesOf = (r: Awaited<ReturnType<typeof globalSearch>>) =>
  r.results.map((x: { type: string; title: string }) => `${x.type}:${x.title}`);

beforeAll(async () => {
  await seedTestData();
  const row = await User.findByPk('admin');
  admin = { id: row!.id, role: row!.roleId };

  await WikiPage.destroy({ where: { slug: SLUG }, force: true });
  await WikiPage.create({
    slug: SLUG,
    title: `${TERM} 위키문서`,
    content: `${TERM} 본문`,
    contentText: `${TERM} 본문`,
    authorId: admin.id,
    lastEditorId: admin.id,
    isPublished: true,
  });

  await Memo.destroy({ where: { UserId: admin.id }, force: true });
  await Memo.create({ UserId: admin.id, title: `${TERM} 메모`, content: `${TERM} 내용` });
});

afterAll(async () => {
  // 다른 스위트에 영향이 가지 않도록 되돌린다
  await setFeature('tools.wiki', true);
  await setFeature('tools.memo', true);
});

describe('검색은 꺼진 기능을 보여주지 않는다', () => {
  it('켜져 있으면 위키와 메모가 나온다', async () => {
    await setFeature('tools.wiki', true);
    await setFeature('tools.memo', true);
    const titles = titlesOf(await search());
    expect(titles.some(t => t.startsWith('wiki:'))).toBe(true);
    expect(titles.some(t => t.startsWith('memo:'))).toBe(true);
  });

  it('위키를 끄면 위키가 빠진다 — 메모는 그대로', async () => {
    await setFeature('tools.wiki', false);
    await setFeature('tools.memo', true);
    const titles = titlesOf(await search());
    expect(titles.some(t => t.startsWith('wiki:'))).toBe(false);
    expect(titles.some(t => t.startsWith('memo:'))).toBe(true);
  });

  it('메모를 끄면 메모가 빠진다 — 위키는 그대로', async () => {
    await setFeature('tools.wiki', true);
    await setFeature('tools.memo', false);
    const titles = titlesOf(await search());
    expect(titles.some(t => t.startsWith('memo:'))).toBe(false);
    expect(titles.some(t => t.startsWith('wiki:'))).toBe(true);
  });

  it('둘 다 끄면 둘 다 빠진다', async () => {
    await setFeature('tools.wiki', false);
    await setFeature('tools.memo', false);
    const titles = titlesOf(await search());
    expect(titles.some(t => t.startsWith('wiki:'))).toBe(false);
    expect(titles.some(t => t.startsWith('memo:'))).toBe(false);
  });
});
