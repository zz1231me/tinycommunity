import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';

// 게시판을 지울 때 첨부의 '이전 버전' 파일까지 지운다.
//
// 같은 이름으로 다시 올리면 밀려난 파일이 PostAttachmentVersion 으로 남는다. 게시판을
// 지우면 그 행은 cascade 로 사라지지만 파일은 디스크에 남는다 — 행이 없어지는 순간
// 어떤 파일이었는지 되짚을 방법도 사라져, 아무도 열 수 없는 파일이 영원히 쌓인다.
//
// 글 하나를 지우는 경로(post.service)는 이미 이렇게 하고 있었고 postPurge 테스트가
// 그걸 고정해 두었다. 게시판을 통째로 지우는 경로만 빠져 있었다.

const BOARD = 'bdelver';
let adminCookie: string;
const tempDirs: string[] = [];

function makeFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdelver-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/** 업로드된 파일의 실제 경로 (board.service 의 삭제 경로와 같은 규칙) */
const uploadedPath = (filename: string) =>
  path.resolve(process.cwd(), 'uploads', 'files', filename);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');

  await Board.findOrCreate({
    where: { id: BOARD },
    defaults: {
      id: BOARD,
      name: '삭제 확인용',
      description: '삭제 확인용',
      isPersonal: false,
      isActive: true,
      order: 92,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: BOARD, roleId: 'admin' },
    defaults: { boardId: BOARD, roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
  });
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

describe('게시판을 지우면 밀려난 첨부 파일도 함께 지운다', () => {
  it('이전 버전 파일이 디스크에 남지 않는다', async () => {
    // 1) 첨부가 있는 글을 만들고
    const created = await request(app)
      .post(`/api/posts/${BOARD}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .field('title', `버전삭제 ${Date.now()}`)
      .field('content', '<p>x</p>')
      .field('originalFilenames', JSON.stringify(['doc.txt']))
      .attach('files', makeFile('doc.txt', '첫 번째'));
    expect(created.status).toBe(201);
    const postId = created.body.data.id;

    // 2) 같은 이름으로 다시 올려 이전 버전을 만든다
    const replaced = await request(app)
      .put(`/api/posts/${BOARD}/${postId}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .field('title', '버전삭제 수정')
      .field('content', '<p>x</p>')
      .field('keepExistingFiles', 'true')
      .field('originalFilenames', JSON.stringify(['doc.txt']))
      .attach('files', makeFile('doc.txt', '두 번째'));
    expect(replaced.status).toBe(200);

    const versions = await PostAttachmentVersion.findAll({
      where: { postId },
      attributes: ['filename'],
    });
    expect(versions.length).toBeGreaterThan(0);
    const oldFile = uploadedPath(versions[0].filename);

    // 지금 붙어 있는 첨부의 파일 — 대조군으로 쓴다
    const detail = await request(app)
      .get(`/api/posts/${BOARD}/${postId}`)
      .set('Cookie', adminCookie);
    const currentFile = uploadedPath(detail.body.data.attachments[0].storedName);

    expect(fs.existsSync(oldFile)).toBe(true);
    expect(fs.existsSync(currentFile)).toBe(true);

    // 3) 게시판을 통째로 지운다
    const removed = await request(app)
      .delete(`/api/admin/boards/${BOARD}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect([200, 204]).toContain(removed.status);

    // 지금 첨부가 지워지는 것은 원래 되던 일이다 — 이게 false 면 이 환경에서 파일
    // 삭제 자체가 동작하지 않는다는 뜻이므로, 아래 단언을 잘못 읽지 않게 함께 본다.
    expect(fs.existsSync(currentFile)).toBe(false);
    // 이전 버전 파일이 이번 수정으로 함께 지워져야 한다
    expect(fs.existsSync(oldFile)).toBe(false);
  });
});
