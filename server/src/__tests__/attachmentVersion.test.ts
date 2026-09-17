import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';

// 첨부 파일의 이전 버전.
//
// 업무 문서는 계속 개정된다. 같은 이름으로 다시 올렸을 때 예전 파일이 그냥 사라지면
// "이전 버전으로 돌려 보자" 가 불가능하고, 그대로 두면 같은 이름의 첨부가 둘이 되어
// 본문의 증적 참조가 어느 쪽인지 모호해진다.

let adminCookie: string;
let userCookie: string;
const tempFiles: string[] = [];

/** 이름과 내용을 정해 임시 파일을 만든다 */
function makeFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attver-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  tempFiles.push(filePath);
  return filePath;
}

async function createPostWithFile(name: string, content: string): Promise<string> {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .field('title', `첨부버전 ${Date.now()}`)
    .field('content', '<p>x</p>')
    .field('originalFilenames', JSON.stringify([name]))
    .attach('files', makeFile(name, content));
  expect(res.status).toBe(201);
  return res.body.data.id;
}

/** 같은 이름으로 새 파일을 올려 교체한다 */
function replaceFile(postId: string, name: string, content: string) {
  return request(app)
    .put(`/api/posts/notice/${postId}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .field('title', '첨부버전 수정')
    .field('content', '<p>x</p>')
    .field('keepExistingFiles', 'true')
    .field('originalFilenames', JSON.stringify([name]))
    .attach('files', makeFile(name, content));
}

function versions(cookie: string, postId: string) {
  return request(app).get(`/api/posts/notice/${postId}/attachment-versions`).set('Cookie', cookie);
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');
});

afterAll(() => {
  for (const f of tempFiles) fs.rmSync(path.dirname(f), { recursive: true, force: true });
});

describe('같은 이름으로 다시 올리기', () => {
  it('첨부는 하나로 유지되고 예전 것이 이력에 남는다', async () => {
    const id = await createPostWithFile('보고서.txt', 'v1 내용');
    const res = await replaceFile(id, '보고서.txt', 'v2 내용');
    expect(res.status).toBe(200);

    // 같은 이름의 첨부가 둘이 되면 본문의 증적 참조가 모호해진다
    const detail = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    const names = detail.body.data.attachments.map((a: { originalName: string }) => a.originalName);
    expect(names.filter((n: string) => n === '보고서.txt')).toHaveLength(1);

    const history = await versions(adminCookie, id);
    expect(history.status).toBe(200);
    const entry = history.body.data.find(
      (g: { originalName: string }) => g.originalName === '보고서.txt'
    );
    expect(entry.versions).toHaveLength(1);
  });

  it('예전 파일을 디스크에서 지우지 않는다 — 이력이 이력 노릇을 하려면 열려야 한다', async () => {
    const id = await createPostWithFile('설계서.txt', '초안');
    await replaceFile(id, '설계서.txt', '개정');

    const history = await versions(adminCookie, id);
    const old = history.body.data[0].versions[0];

    // 이력에 적힌 그 파일을 실제로 내려받을 수 있어야 한다
    const download = await request(app)
      .get(`/api/uploads/download/${old.filename}`)
      .set('Cookie', adminCookie)
      .buffer(true)
      .parse((res, cb) => {
        // 다운로드는 octet-stream 이라 supertest 기본 파서가 text 를 채우지 않는다
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect((download.body as Buffer).toString()).toBe('초안');
  });

  it('세 번 고치면 두 개의 이전 버전이 쌓인다', async () => {
    const id = await createPostWithFile('회의록.txt', 'v1');
    await replaceFile(id, '회의록.txt', 'v2');
    await replaceFile(id, '회의록.txt', 'v3');

    const history = await versions(adminCookie, id);
    expect(history.body.data[0].versions).toHaveLength(2);
  });

  it('최신 버전이 먼저 온다', async () => {
    const id = await createPostWithFile('순서.txt', 'v1');
    await replaceFile(id, '순서.txt', 'v2');
    await replaceFile(id, '순서.txt', 'v3');

    const history = await versions(adminCookie, id);
    const list = history.body.data[0].versions as Array<{ createdAt: string }>;
    expect(new Date(list[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(list[1].createdAt).getTime()
    );
  });
});

describe('버전이 생기지 않는 경우', () => {
  it('다른 이름으로 올리면 첨부가 둘이 되고 이력은 남지 않는다', async () => {
    const id = await createPostWithFile('첫파일.txt', 'a');
    await request(app)
      .put(`/api/posts/notice/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .field('title', '다른 이름 추가')
      .field('content', '<p>x</p>')
      .field('keepExistingFiles', 'true')
      .field('originalFilenames', JSON.stringify(['둘째파일.txt']))
      .attach('files', makeFile('둘째파일.txt', 'b'));

    const detail = await request(app).get(`/api/posts/notice/${id}`).set('Cookie', adminCookie);
    expect(detail.body.data.attachments).toHaveLength(2);

    const history = await versions(adminCookie, id);
    expect(history.body.data).toHaveLength(0);
  });

  it('첨부를 아예 올리지 않은 글은 이력이 비어 있다', async () => {
    const res = await request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ title: `첨부없음 ${Date.now()}`, content: '<p>x</p>' });

    const history = await versions(adminCookie, res.body.data.id);
    expect(history.body.data).toEqual([]);
  });
});

describe('접근 권한', () => {
  it('글을 볼 수 있으면 이력도 볼 수 있다', async () => {
    const id = await createPostWithFile('공개.txt', 'v1');
    await replaceFile(id, '공개.txt', 'v2');

    expect((await versions(userCookie, id)).status).toBe(200);
  });

  it('없는 글은 404', async () => {
    expect((await versions(adminCookie, 'nosuchpost1')).status).toBe(404);
  });

  it('비로그인은 401', async () => {
    const res = await request(app).get('/api/posts/notice/whatever/attachment-versions');
    expect(res.status).toBe(401);
  });
});

describe('저장 형태', () => {
  it('이력 행에 올린 사람과 크기·형식이 함께 남는다', async () => {
    const id = await createPostWithFile('메타.txt', '내용12345');
    await replaceFile(id, '메타.txt', '새 내용');

    const row = await PostAttachmentVersion.findOne({ where: { postId: id } });
    expect(row?.originalName).toBe('메타.txt');
    expect(row?.uploadedBy).toBe('admin');
    expect(row?.size).toBeGreaterThan(0);
  });
});

describe('originalFilenames 가 없거나 깨졌을 때의 파일명', () => {
  // 클라이언트는 한글 파일명이 multipart 헤더에서 깨지는 것을 피하려고 이름을 따로 보낸다.
  // 그 값이 빠지거나 망가졌다고 해서 multer 가 이미 들고 있는 진짜 이름까지 버릴 이유는 없다.
  async function upload(fields: Record<string, string>, name: string) {
    const req = request(app)
      .post('/api/posts/notice')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .field('title', `이름폴백 ${Date.now()}${Math.random()}`)
      .field('content', '<p>x</p>');
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    const res = await req.attach('files', makeFile(name, 'x'));
    expect(res.status).toBe(201);
    const detail = await request(app)
      .get(`/api/posts/notice/${res.body.data.id}`)
      .set('Cookie', adminCookie);
    return detail.body.data.attachments.map((a: { originalName: string }) => a.originalName);
  }

  it('아예 안 보내면 업로드된 파일 이름을 쓴다', async () => {
    expect(await upload({}, '보고서.txt')).toEqual(['보고서.txt']);
  });

  it('JSON 이 깨져 있어도 파일 이름을 쓴다', async () => {
    expect(await upload({ originalFilenames: '{깨진 JSON' }, '계약서.txt')).toEqual(['계약서.txt']);
  });

  it('배열이 아닌 JSON 이 와도 파일 이름을 쓴다', async () => {
    expect(await upload({ originalFilenames: '"문자열"' }, '회의록.txt')).toEqual(['회의록.txt']);
  });

  it('제대로 보내면 그 이름을 그대로 쓴다', async () => {
    expect(await upload({ originalFilenames: JSON.stringify(['원래이름.txt']) }, 'x.txt')).toEqual([
      '원래이름.txt',
    ]);
  });
});
