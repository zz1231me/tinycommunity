import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';

// 밀려난 첨부(이전 버전)의 인가.
//
// 같은 이름으로 다시 올리면 예전 파일은 Post.attachments 목록에서 빠지고
// PostAttachmentVersion 으로 옮겨진다. 그런데 파일은 디스크에 그대로 남는다(이력이니까).
//
// 인가 함수는 파일명으로 Post.attachments 를 뒤져 주인을 찾고, 못 찾으면 통과시켰다.
// 그래서 밀려난 파일은 '주인 없는 파일' 로 보여 검사를 통째로 건너뛰었다 —
// 게시판 권한이 끊긴 뒤에도, 글이 비밀글로 바뀐 뒤에도, 예전에 받아 둔 주소로
// 아무 로그인 계정이나 계속 내려받을 수 있었다.
//
// 이름은 추측할 수 없으니(시각_16자리 난수) 무작위로 훑는 공격은 아니다.
// '한 번 받은 주소가 권한이 끊긴 뒤에도 계속 통한다' 가 이 구멍의 본질이다.

const BOARD = 'archauth';
let adminCookie: string;
let userCookie: string;
let postId: string;
/** 지금 붙어 있는 첨부 */
let currentName: string;
/** 같은 이름으로 교체돼 밀려난 첨부 */
let archivedName: string;
const tempDirs: string[] = [];

function makeFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archauth-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

const download = (cookie: string, filename: string) =>
  request(app).get(`/api/uploads/download/${filename}`).set('Cookie', cookie);

const info = (cookie: string, filename: string) =>
  request(app).get(`/api/uploads/info/${filename}`).set('Cookie', cookie);

const thumb = (cookie: string, filename: string) =>
  request(app).get(`/api/uploads/thumb/${filename}`).set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  // 관리자만 읽을 수 있는 게시판
  await Board.findOrCreate({
    where: { id: BOARD },
    defaults: {
      id: BOARD,
      name: '밀려난 첨부 인가 확인용',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      order: 93,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: BOARD, roleId: 'admin' },
    defaults: { boardId: BOARD, roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
  });

  const created = await request(app)
    .post(`/api/posts/${BOARD}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .field('title', `밀려난 첨부 ${Date.now()}`)
    .field('content', '<p>x</p>')
    .field('originalFilenames', JSON.stringify(['doc.txt']))
    .attach('files', makeFile('doc.txt', '첫 번째 — 이것이 밀려난다'));
  expect(created.status).toBe(201);
  postId = created.body.data.id;

  // 같은 이름으로 다시 올려 v1 을 이력으로 밀어낸다
  const replaced = await request(app)
    .put(`/api/posts/${BOARD}/${postId}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .field('title', '밀려난 첨부 수정')
    .field('content', '<p>x</p>')
    .field('keepExistingFiles', 'true')
    .field('originalFilenames', JSON.stringify(['doc.txt']))
    .attach('files', makeFile('doc.txt', '두 번째 — 이것이 지금 붙어 있다'));
  expect(replaced.status).toBe(200);

  const version = await PostAttachmentVersion.findOne({
    where: { postId },
    attributes: ['filename'],
  });
  archivedName = version!.filename;
  expect(archivedName).toBeTruthy();

  const detail = await request(app).get(`/api/posts/${BOARD}/${postId}`).set('Cookie', adminCookie);
  currentName = detail.body.data.attachments[0].storedName;
  expect(currentName).toBeTruthy();
  // 두 파일은 서로 달라야 한다 — 같으면 아래 검사가 같은 것을 두 번 보는 셈이다
  expect(archivedName).not.toBe(currentName);
});

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // 임시 파일 정리 실패는 결과와 무관하다
    }
  }
});

describe('밀려난 첨부도 지금 첨부와 같은 규칙을 받는다', () => {
  it('볼 권한이 없으면 이전 버전을 받을 수 없다', async () => {
    const res = await download(userCookie, archivedName);
    expect(res.status).toBe(403);
  });

  it('볼 권한이 있으면 이전 버전을 받을 수 있다 — 양성 대조', async () => {
    // 이것이 없으면 '이전 버전은 전부 막기' 인 구현도 위 테스트를 통과한다
    const res = await download(adminCookie, archivedName);
    expect(res.status).toBe(200);
  });

  it('지금 붙어 있는 첨부도 막힌다 — 판 세팅이 맞는지 확인', async () => {
    // 이 게시판이 정말 관리자 전용인지 확인하는 대조. 여기가 200 이면 위 테스트가
    // '권한 때문에 막힌 것' 인지 '다른 이유로 막힌 것' 인지 알 수 없다.
    const res = await download(userCookie, currentName);
    expect(res.status).toBe(403);
  });

  it('권한이 있으면 지금 첨부도 받을 수 있다 — 양성 대조', async () => {
    const res = await download(adminCookie, currentName);
    expect(res.status).toBe(200);
  });
});

describe('같은 규칙을 쓰는 다른 입구들', () => {
  it('정보 조회도 이전 버전을 막는다', async () => {
    const res = await info(userCookie, archivedName);
    expect(res.status).toBe(403);
  });

  it('썸네일도 이전 버전을 막는다', async () => {
    // 이미지가 아니라 썸네일을 만들 수는 없지만, 인가가 먼저다.
    // 여기서 404 가 나오면 '권한 없는 사람에게 파일 유무를 알려 준' 것이 된다.
    const res = await thumb(userCookie, archivedName);
    expect(res.status).toBe(403);
  });
});

describe('지운 글의 첨부', () => {
  it('글을 지워도 이전 권한 규칙이 그대로 적용된다', async () => {
    // soft delete 된 글은 기본 조회에서 빠진다. 주인을 못 찾는다는 이유로 통과시키면
    // 글을 지우는 순간 그 첨부가 '아무나 받을 수 있는 파일' 이 된다.
    const removed = await request(app)
      .delete(`/api/posts/${BOARD}/${postId}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect([200, 204]).toContain(removed.status);

    const res = await download(userCookie, currentName);
    // 파일이 함께 지워졌다면 404 다 — 그것도 '못 받는다' 이지만 이유가 다르므로
    // 무엇이 나왔는지 구분해서 남긴다.
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
