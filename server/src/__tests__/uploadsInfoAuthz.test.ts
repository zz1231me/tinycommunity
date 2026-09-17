import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';

// 첨부 정보 조회(/api/uploads/info)의 인가.
//
// download·thumb 는 authorizeAttachmentAccess 를 지나는데 info 만 빠져 있었다.
// 내용이 새지는 않지만, 볼 권한이 없는 사람도 파일명만 알면 '그 파일이 있다'는 것과
// 크기·수정시각을 확인할 수 있었다. 첨부 서비스의 주석이 "새 첨부 서빙 경로를 추가할
// 때는 반드시 이 함수를 통과시켜야 한다" 고 못 박아 둔 바로 그 구멍이다.
//
// 인가는 존재 확인보다 '먼저' 해야 한다. 뒤에 두면 없는 파일은 404, 있는 파일은 403 이
// 되어 응답 코드 자체가 파일 유무를 알려 준다.

const BOARD = 'infoboard';
let adminCookie: string;
let userCookie: string;
let savedName: string;
const tempFiles: string[] = [];

function makeFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infoauth-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  tempFiles.push(filePath);
  return filePath;
}

const info = (cookie: string, filename: string) =>
  request(app).get(`/api/uploads/info/${filename}`).set('Cookie', cookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
  userCookie = await loginAs('testuser', 'TestUser123!');

  // 관리자만 읽을 수 있는 게시판
  await Board.findOrCreate({
    where: { id: BOARD },
    defaults: {
      id: BOARD,
      name: '첨부 인가 확인용',
      description: '관리자 전용',
      isPersonal: false,
      isActive: true,
      order: 90,
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
    .field('title', `첨부 인가 ${Date.now()}`)
    .field('content', '<p>x</p>')
    .field('originalFilenames', JSON.stringify(['secret-note.txt']))
    .attach('files', makeFile('secret-note.txt', '안에 무엇이 있든 이름만으로 알 수 없어야 한다'));
  expect(created.status).toBe(201);

  const detail = await request(app)
    .get(`/api/posts/${BOARD}/${created.body.data.id}`)
    .set('Cookie', adminCookie);
  // 상세 응답은 formatAttachments 를 거치며 이름이 바뀐다 —
  // 저장된 파일명은 filename 이 아니라 storedName 으로 내려온다.
  savedName = detail.body.data.attachments[0].storedName;
  expect(savedName).toBeTruthy();
});

afterAll(() => {
  for (const f of tempFiles) {
    try {
      fs.rmSync(path.dirname(f), { recursive: true, force: true });
    } catch {
      // 임시 파일 정리 실패는 테스트 결과와 무관하다
    }
  }
});

describe('첨부 정보 조회의 인가', () => {
  it('볼 권한이 없으면 파일이 있는지도 알려 주지 않는다', async () => {
    const res = await info(userCookie, savedName);
    expect(res.status).toBe(403);
    // 크기·수정시각이 새어 나가면 안 된다
    expect(res.body.data).toBeFalsy();
  });

  it('볼 권한이 있으면 정보를 준다 — 양성 대조', async () => {
    // 이것이 없으면 '전부 403' 인 구현도 위 테스트를 통과한다
    const res = await info(adminCookie, savedName);
    expect(res.status).toBe(200);
    expect(res.body.data.filename).toBe(savedName);
    expect(res.body.data.size).toBeGreaterThan(0);
  });

  it('로그인하지 않으면 볼 수 없다', async () => {
    const res = await request(app).get(`/api/uploads/info/${savedName}`);
    expect([401, 419]).toContain(res.status);
  });

  it('권한이 있어도 없는 파일은 없다고 한다', async () => {
    // 인가를 존재 확인 앞에 두었으므로, 권한이 있는 사람에게는 정상적으로 404 가 간다
    const res = await info(adminCookie, '1700000000000_deadbeefdeadbeef.txt');
    expect([400, 404]).toContain(res.status);
  });
});
