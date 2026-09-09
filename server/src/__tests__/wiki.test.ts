import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER, relaxRateLimits } from './helpers';
import { WikiPage } from '../models/WikiPage';
import { WikiRevision } from '../models/WikiRevision';

// 위키 — 트리, 부분 수정, 리비전, 순환 참조.
//
// 여러 사람이 같은 문서를 오래 고쳐 쓰므로, 한 번의 수정이 다른 항목을 지우면
// 드러나지 않은 채 쌓인다. 본문만 고쳤는데 상위 문서·정렬·공개 여부가 초기화되는
// 부류는 화면에서 바로 보이지 않는다.

let adminCookie: string;

beforeAll(async () => {
  await seedTestData();
  await relaxRateLimits();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function createPage(body: Record<string, unknown>) {
  const res = await request(app)
    .post('/api/wiki')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send(body);
  return res;
}

function updatePage(slug: string, body: Record<string, unknown>) {
  return request(app)
    .put(`/api/wiki/${slug}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send(body);
}

describe('위키 부분 수정', () => {
  it('본문만 고치면 상위 문서·정렬·공개 여부가 그대로 남는다', async () => {
    const parent = await createPage({ slug: `p-${uniq()}`, title: '상위' });
    expect(parent.status).toBe(201);
    const parentId = parent.body.data.id;

    const child = await createPage({ slug: `c-${uniq()}`, title: '하위', parentId });
    expect(child.status).toBe(201);
    const slug = child.body.data.slug;

    // 생성 API 에 없는 값은 직접 세워 둔다 (수정이 이 값들을 건드리는지 보려는 것)
    await WikiPage.update({ order: 7, isPublished: false }, { where: { slug } });

    const res = await updatePage(slug, { content: '<p>본문만 바꿈</p>' });
    expect(res.status).toBe(200);

    const after = await WikiPage.findOne({ where: { slug } });
    expect(after?.content).toContain('본문만 바꿈');
    expect(after?.parentId).toBe(parentId);
    expect(after?.order).toBe(7);
    expect(after?.isPublished).toBe(false);
    expect(after?.title).toBe('하위');
  });

  it('제목만 고치면 본문이 남는다', async () => {
    const page = await createPage({
      slug: `t-${uniq()}`,
      title: '원래 제목',
      content: '<p>지켜야 할 본문</p>',
    });
    const slug = page.body.data.slug;

    const res = await updatePage(slug, { title: '새 제목' });
    expect(res.status).toBe(200);

    const after = await WikiPage.findOne({ where: { slug } });
    expect(after?.title).toBe('새 제목');
    expect(after?.content).toContain('지켜야 할 본문');
  });
});

describe('위키 리비전', () => {
  it('생성과 수정마다 그 시점의 내용이 남는다', async () => {
    const page = await createPage({ slug: `r-${uniq()}`, title: 'v1', content: '<p>하나</p>' });
    const slug = page.body.data.slug;
    const id = page.body.data.id;

    await updatePage(slug, { title: 'v2', content: '<p>둘</p>' });
    await updatePage(slug, { title: 'v3', content: '<p>셋</p>' });

    const revs = await WikiRevision.findAll({
      where: { wikiPageId: id },
      order: [['id', 'ASC']],
    });
    expect(revs.map(r => r.title)).toEqual(['v1', 'v2', 'v3']);
    expect(revs[0].content).toContain('하나');
    expect(revs[2].content).toContain('셋');
  });

  it('본문·제목이 안 바뀐 수정은 리비전을 늘리지 않는다', async () => {
    const page = await createPage({ slug: `n-${uniq()}`, title: '고정', content: '<p>고정</p>' });
    const id = page.body.data.id;

    await updatePage(page.body.data.slug, { order: 3 });

    const count = await WikiRevision.count({ where: { wikiPageId: id } });
    expect(count).toBe(1);
  });
});

describe('위키 순환 참조', () => {
  it('자기 자신을 상위로 지정할 수 없다', async () => {
    const page = await createPage({ slug: `s-${uniq()}`, title: '자기참조' });
    const res = await updatePage(page.body.data.slug, { parentId: page.body.data.id });
    expect(res.status).toBe(400);
  });

  it('자기 자손을 상위로 지정할 수 없다', async () => {
    const a = await createPage({ slug: `a-${uniq()}`, title: 'A' });
    const b = await createPage({ slug: `b-${uniq()}`, title: 'B', parentId: a.body.data.id });
    const c = await createPage({ slug: `c2-${uniq()}`, title: 'C', parentId: b.body.data.id });

    // A 의 상위를 C 로 두면 A→C→B→A 순환
    const res = await updatePage(a.body.data.slug, { parentId: c.body.data.id });
    expect(res.status).toBe(400);
  });

  it('없는 상위 문서는 거부된다', async () => {
    const page = await createPage({ slug: `x-${uniq()}`, title: 'X' });
    const res = await updatePage(page.body.data.slug, { parentId: 99999999 });
    expect(res.status).toBe(404);
  });

  it('같은 슬러그는 두 번 만들 수 없다', async () => {
    const slug = `dup-${uniq()}`;
    expect((await createPage({ slug, title: '첫' })).status).toBe(201);
    expect((await createPage({ slug, title: '둘' })).status).toBe(409);
  });
});
