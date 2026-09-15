import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { CustomPage } from '../models/CustomPage';
import { UPLOAD_DIRS } from '../middlewares/upload/config';

// 커스텀 페이지 번들은 관리자가 올린 ZIP 을 서버 디스크에 풀어놓는다.
// zip-slip·zip-bomb·서버 실행 파일이 통과하면 곧바로 서버 장악으로 이어지므로,
// 방어가 실제로 동작하는지 실제 ZIP 을 만들어 확인한다.

let adminCookie: string;
const createdPageIds: string[] = [];

function zipWith(entries: Array<[string, string | Buffer]>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of entries) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
  }
  return zip.toBuffer();
}

/**
 * 경로 탈출 엔트리가 들어 있는 "진짜" 악성 ZIP 을 만든다.
 *
 * ⚠️ adm-zip 의 addFile() 은 엔트리명을 정규화한다 — '../escaped.txt' 를 넘기면
 *    'escaped.txt' 로 바뀌어 저장된다. 그대로 쓰면 공격 ZIP 이 만들어지지 않아
 *    서버 방어를 통과했다고 착각하게 된다(테스트가 통과해도 의미가 없다).
 *    그래서 같은 길이의 자리표시자로 만든 뒤, ZIP 바이트에서 이름만 치환한다.
 *    (엔트리명은 로컬 헤더와 중앙 디렉터리 두 곳에 들어가므로 전역 치환)
 */
function zipWithRawName(placeholder: string, actualName: string, extra = 'index.html'): Buffer {
  if (placeholder.length !== actualName.length) {
    throw new Error(`자리표시자와 실제 이름의 길이가 같아야 합니다: ${placeholder}/${actualName}`);
  }
  const zip = new AdmZip();
  zip.addFile(extra, Buffer.from('ok'));
  zip.addFile(placeholder, Buffer.from('pwned'));
  const buf = zip.toBuffer();
  return Buffer.from(buf.toString('binary').split(placeholder).join(actualName), 'binary');
}

async function newPage(slug: string): Promise<string> {
  const res = await request(app)
    .post('/api/custom-pages')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ slug, title: `번들 ${slug}` });
  expect(res.status).toBe(200);
  const id = res.body.data.id as string;
  createdPageIds.push(id);
  return id;
}

function uploadBundle(pageId: string, buffer: Buffer, filename = 'bundle.zip') {
  return request(app)
    .post(`/api/custom-pages/${pageId}/bundle`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .attach('bundle', buffer, filename);
}

/** 번들 디렉터리에 실제로 기록된 파일 목록 */
async function filesOnDisk(pageId: string): Promise<string[]> {
  const dir = path.join(UPLOAD_DIRS.CUSTOM_PAGES, pageId);
  const out: string[] = [];
  async function walk(d: string, prefix = '') {
    let items;
    try {
      items = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      if (it.isDirectory()) await walk(path.join(d, it.name), `${prefix}${it.name}/`);
      else out.push(`${prefix}${it.name}`);
    }
  }
  await walk(dir);
  return out.sort();
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

afterAll(async () => {
  for (const id of createdPageIds) {
    await fs.rm(path.join(UPLOAD_DIRS.CUSTOM_PAGES, id), { recursive: true, force: true });
    await CustomPage.destroy({ where: { id }, force: true });
  }
});

describe('정상 번들', () => {
  it('index.html 을 진입 파일로 잡고 하위 자산까지 기록한다', async () => {
    const id = await newPage('bundle-ok');
    const res = await uploadBundle(
      id,
      zipWith([
        ['index.html', '<h1>hello</h1>'],
        ['assets/app.css', 'body{}'],
        ['assets/app.js', 'console.log(1)'],
      ])
    );

    expect(res.status).toBe(200);
    expect(res.body.data.entryFile).toBe('index.html');
    expect(await filesOnDisk(id)).toEqual(['assets/app.css', 'assets/app.js', 'index.html']);
  });

  it('index.html 이 없으면 루트의 다른 html 을 진입 파일로 고른다', async () => {
    const id = await newPage('bundle-entry');
    const res = await uploadBundle(id, zipWith([['main.html', '<p>x</p>']]));

    expect(res.status).toBe(200);
    expect(res.body.data.entryFile).toBe('main.html');
  });

  it('재업로드 시 이전 번들의 잔여 파일이 남지 않는다', async () => {
    const id = await newPage('bundle-replace');
    await uploadBundle(
      id,
      zipWith([
        ['index.html', 'v1'],
        ['old.css', 'a{}'],
      ])
    );
    expect(await filesOnDisk(id)).toContain('old.css');

    await uploadBundle(id, zipWith([['index.html', 'v2']]));
    expect(await filesOnDisk(id)).toEqual(['index.html']);
  });
});

describe('★ zip-slip (경로 탈출)', () => {
  it('자리표시자 치환이 실제로 악성 엔트리를 만든다 (테스트 자체의 유효성 확인)', () => {
    const buf = zipWithRawName('zzzescaped.txt', '../escaped.txt');
    const names = new AdmZip(buf).getEntries().map(e => e.entryName);
    // 이게 깨지면 아래 zip-slip 테스트들은 공격을 재현하지 못한 채 통과한다
    expect(names).toContain('../escaped.txt');
  });

  it('상위 디렉터리로 탈출하는 경로를 거부한다', async () => {
    const id = await newPage('slip-parent');
    const res = await uploadBundle(id, zipWithRawName('zzzescaped.txt', '../escaped.txt'));

    expect(res.status).toBe(400);
    // 조용히 정정하지 않고 통째로 거부해야 한다 — 아무것도 기록되면 안 된다
    expect(await filesOnDisk(id)).toEqual([]);
  });

  it('깊은 상위 탈출(../../)도 거부한다', async () => {
    const id = await newPage('slip-deep');
    const res = await uploadBundle(
      id,
      zipWithRawName('a/zz/zz/zz/etc/passwd', 'a/../../../etc/passwd')
    );

    expect(res.status).toBe(400);
    expect(await filesOnDisk(id)).toEqual([]);
  });

  it('절대경로 엔트리를 거부한다', async () => {
    const id = await newPage('slip-abs');
    const res = await uploadBundle(id, zipWithRawName('ztmp/evil.txt', '/tmp/evil.txt'));

    expect(res.status).toBe(400);
    expect(await filesOnDisk(id)).toEqual([]);
  });

  it('역슬래시 경로도 정규화해 탈출을 막는다', async () => {
    const id = await newPage('slip-backslash');
    const res = await uploadBundle(id, zipWithRawName('yyyescaped.txt', '..\\escaped.txt'));

    expect(res.status).toBe(400);
    expect(await filesOnDisk(id)).toEqual([]);
  });
});

describe('★ 서버 실행 파일 차단', () => {
  it.each(['shell.php', 'legacy.jsp', 'run.sh', 'app.py', '.htaccess'])(
    '%s 가 들어 있으면 번들 전체를 거부한다',
    async name => {
      const id = await newPage(`blocked-${name.replace(/[^a-z0-9]/gi, '')}`);
      const res = await uploadBundle(
        id,
        zipWith([
          ['index.html', 'ok'],
          [name, 'payload'],
        ])
      );

      expect(res.status).toBe(400);
      expect(await filesOnDisk(id)).toEqual([]);
    }
  );

  it('반대로 정적 자산(.html/.css/.js/.svg)은 허용한다', async () => {
    const id = await newPage('bundle-static');
    const res = await uploadBundle(
      id,
      zipWith([
        ['index.html', '<b>x</b>'],
        ['s.css', 'a{}'],
        ['s.js', '1'],
        ['i.svg', '<svg/>'],
      ])
    );

    expect(res.status).toBe(200);
    expect(await filesOnDisk(id)).toHaveLength(4);
  });
});

describe('★ 자원 상한 (zip-bomb 방지)', () => {
  it('파일 개수 상한(500)을 넘으면 거부한다', async () => {
    const id = await newPage('bomb-count');
    const many: Array<[string, string]> = [['index.html', 'ok']];
    for (let i = 0; i < 501; i++) many.push([`f${i}.txt`, 'x']);

    const res = await uploadBundle(id, zipWith(many));

    expect(res.status).toBe(400);
    expect(await filesOnDisk(id)).toEqual([]);
  });

  it('압축 해제 총량 상한(300MB)을 넘으면 거부한다', async () => {
    const id = await newPage('bomb-size');
    // 0 으로 채운 버퍼는 극단적으로 잘 압축돼, 작은 zip 이 거대한 해제 크기를 갖는다
    const chunk = Buffer.alloc(40 * 1024 * 1024);
    const res = await uploadBundle(
      id,
      zipWith([
        ['index.html', 'ok'],
        ['a.bin', chunk],
        ['b.bin', chunk],
        ['c.bin', chunk],
        ['d.bin', chunk],
        ['e.bin', chunk],
        ['f.bin', chunk],
        ['g.bin', chunk],
        ['h.bin', chunk],
      ])
    );

    expect(res.status).toBe(400);
    expect(await filesOnDisk(id)).toEqual([]);
  }, 60000);
});

describe('잘못된 입력', () => {
  it('ZIP 이 아닌 파일을 거부한다', async () => {
    const id = await newPage('not-zip');
    const res = await uploadBundle(id, Buffer.from('이건 zip 이 아닙니다'), 'fake.zip');

    expect(res.status).toBe(400);
  });

  it('HTML 이 하나도 없으면 거부한다', async () => {
    const id = await newPage('no-html');
    const res = await uploadBundle(id, zipWith([['readme.txt', 'hi']]));

    expect(res.status).toBe(400);
    expect(await filesOnDisk(id)).toEqual([]);
  });

  it('빈 ZIP 을 거부한다', async () => {
    const id = await newPage('empty-zip');
    const res = await uploadBundle(id, zipWith([]));

    expect(res.status).toBe(400);
  });
});

describe('권한', () => {
  it('관리자가 아니면 번들을 올릴 수 없다', async () => {
    const id = await newPage('perm-check');
    const userCookie = await loginAs('testuser', 'TestUser123!');

    const res = await request(app)
      .post(`/api/custom-pages/${id}/bundle`)
      .set(CSRF_HEADER)
      .set('Cookie', userCookie)
      .attach('bundle', zipWith([['index.html', 'x']]), 'b.zip');

    expect(res.status).toBe(403);
  });

  it('미인증은 401 또는 403 으로 차단된다', async () => {
    const id = await newPage('perm-anon');
    const res = await request(app)
      .post(`/api/custom-pages/${id}/bundle`)
      .set(CSRF_HEADER)
      .attach('bundle', zipWith([['index.html', 'x']]), 'b.zip');

    expect([401, 403]).toContain(res.status);
  });
});

// 페이지는 HTML·번들·외부 URL 중 하나로만 그려진다. 예전에는 종류를 바꿔도 옛 값이
// 남아, 무엇이 보일지 값들의 우선순위로 정해졌다(그래서 화면에서 전환을 막아 뒀다).
describe('페이지 종류 바꾸기', () => {
  const update = (id: string, body: Record<string, unknown>) =>
    request(app)
      .put(`/api/custom-pages/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ slug: `mode-${id.slice(0, 8)}`, title: '종류 변경', html: '', ...body });

  it('번들 → 외부 URL 로 바꾸면 올려 둔 파일이 지워진다', async () => {
    const id = await newPage('mode-to-url');
    await uploadBundle(id, zipWith([['index.html', '<p>x</p>']]));
    expect(await filesOnDisk(id)).toContain('index.html');

    const res = await update(id, {
      slug: 'mode-to-url',
      mode: 'url',
      externalUrl: 'https://example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.bundlePath).toBeNull();
    // normalizeExternalUrl 이 URL 을 정규화한다
    expect(res.body.data.externalUrl).toBe('https://example.com/');
    // 참조가 사라진 파일이 용량만 차지하면 안 된다
    expect(await filesOnDisk(id)).toEqual([]);
  });

  it('외부 URL → HTML 로 바꾸면 URL 이 지워진다', async () => {
    const id = await newPage('mode-to-html');
    await update(id, { slug: 'mode-to-html', mode: 'url', externalUrl: 'https://example.com' });

    const res = await update(id, {
      slug: 'mode-to-html',
      mode: 'html',
      html: '<p>본문</p>',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.externalUrl).toBeNull();
    expect(res.body.data.html).toBe('<p>본문</p>');
  });

  it('올린 파일 없이 번들로 바꾸려 하면 거절한다', async () => {
    const id = await newPage('mode-no-bundle');
    const res = await update(id, { slug: 'mode-no-bundle', mode: 'bundle' });
    expect(res.status).toBe(400);
  });

  it('URL 없이 외부 URL 로 바꾸려 하면 거절한다', async () => {
    const id = await newPage('mode-no-url');
    const res = await update(id, { slug: 'mode-no-url', mode: 'url', externalUrl: '' });
    expect(res.status).toBe(400);
  });

  it('정렬 순서를 문자열로 보내도 저장된다 — 화면에서 그렇게 온다', async () => {
    const id = await newPage('mode-order');
    const res = await update(id, { slug: 'mode-order', mode: 'html', order: '7' });
    expect(res.status).toBe(200);
    expect(res.body.data.order).toBe(7);
  });
});
