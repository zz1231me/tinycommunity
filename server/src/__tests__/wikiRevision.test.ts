// server/src/__tests__/wikiRevision.test.ts
// 위키 이력이 '실제로 바뀐 저장' 만 남기는지.
//
// 편집 화면은 저장할 때마다 제목·내용을 함께 보낸다. 값이 왔는지로만 판단하면
// 고치지 않은 저장까지 이력에 쌓여, 나중에 어디서 무엇이 바뀌었는지 찾을 수 없다.

import { seedTestData } from './helpers';
import { wikiService } from '../services/wiki.service';
import { WikiPage } from '../models/WikiPage';
import { WikiRevision } from '../models/WikiRevision';
import { User } from '../models/User';

const UID = 'wikiuser';
const SLUG = 'revision-test-page';

const revisionCount = async (pageId: number) =>
  WikiRevision.count({ where: { wikiPageId: pageId } });

beforeAll(async () => {
  await seedTestData();
  if (!(await User.findByPk(UID))) {
    await User.create({
      id: UID,
      password: 'TestUser123!',
      name: '위키사용자',
      email: 'wiki@test.com',
      roleId: 'user',
      isActive: true,
    });
  }
});

beforeEach(async () => {
  const page = await WikiPage.findOne({ where: { slug: SLUG } });
  if (page) {
    await WikiRevision.destroy({ where: { wikiPageId: page.id }, force: true });
    await WikiPage.destroy({ where: { slug: SLUG }, force: true });
  }
});

describe('위키 이력', () => {
  it('만들면 첫 판이 남는다', async () => {
    const page = await wikiService.createPage({ slug: SLUG, title: '처음', content: '본문' }, UID);
    expect(await revisionCount(page.id)).toBe(1);
  });

  it('내용을 고치면 새 판이 남는다', async () => {
    const page = await wikiService.createPage({ slug: SLUG, title: '처음', content: '본문' }, UID);
    await wikiService.updatePage(SLUG, { title: '처음', content: '고친 본문' }, UID);
    expect(await revisionCount(page.id)).toBe(2);
  });

  it('제목만 고쳐도 새 판이 남는다', async () => {
    const page = await wikiService.createPage({ slug: SLUG, title: '처음', content: '본문' }, UID);
    await wikiService.updatePage(SLUG, { title: '바뀐 제목', content: '본문' }, UID);
    expect(await revisionCount(page.id)).toBe(2);
  });

  it('한 글자도 안 고친 저장은 이력에 쌓이지 않는다', async () => {
    const page = await wikiService.createPage({ slug: SLUG, title: '처음', content: '본문' }, UID);
    await wikiService.updatePage(SLUG, { title: '처음', content: '본문' }, UID);
    await wikiService.updatePage(SLUG, { title: '처음', content: '본문' }, UID);
    expect(await revisionCount(page.id)).toBe(1);
  });

  it('공개 여부만 바꾼 저장도 이력에 쌓이지 않는다', async () => {
    const page = await wikiService.createPage({ slug: SLUG, title: '처음', content: '본문' }, UID);
    await wikiService.updatePage(SLUG, { title: '처음', content: '본문', isPublished: false }, UID);
    expect(await revisionCount(page.id)).toBe(1);
    const reloaded = await WikiPage.findByPk(page.id);
    expect(reloaded?.isPublished).toBe(false);
  });
});
