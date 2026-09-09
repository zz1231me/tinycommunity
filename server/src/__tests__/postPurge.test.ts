import request from 'supertest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app, seedTestData, loginAs, CSRF_HEADER, relaxRateLimits } from './helpers';
import { postService } from '../services/post.service';
import { Post } from '../models/Post';
import { PostRevision } from '../models/PostRevision';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
import { PostActivity } from '../models/PostActivity';
import { PostScrap } from '../models/PostScrap';
import { CommentLike } from '../models/CommentLike';
import { Comment } from '../models/Comment';
import Board from '../models/Board';

// 글을 영구 삭제할 때 딸린 것들이 함께 사라지는가.
//
// 글 삭제는 2단계다: 먼저 soft-delete(숨김), 보관 기간이 지나면 purge(영구 삭제).
// purge 는 마지막 단계라 여기서 안 지운 것은 영원히 남는다 — 특히 첨부의 이전 버전은
// 디스크에 파일까지 남아서, 아무도 열 수 없는 파일이 업로드 폴더에 계속 쌓인다.

let adminCookie: string;
const tempDirs: string[] = [];

function makeFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-'));
  tempDirs.push(dir);
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

beforeAll(async () => {
  await seedTestData();
  await relaxRateLimits();
  await Board.update({ taskEnabled: true }, { where: { id: 'notice' } });
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

afterAll(async () => {
  await Board.update({ taskEnabled: false }, { where: { id: 'notice' } });
  for (const d of tempDirs) fs.rmSync(d, { recursive: true, force: true });
});

/** 딸린 자료를 모두 갖춘 글 하나를 만들어 soft-delete 까지 해 둔다 */
async function makeRichPostAndDelete(): Promise<{ postId: string; versionFile: string }> {
  const name = '보고서.txt';
  const created = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .field('title', `정리대상 ${Date.now()}`)
    .field('content', '<p>처음</p>')
    .field('originalFilenames', JSON.stringify([name]))
    .attach('files', makeFile(name, '첫 버전'));
  const postId = created.body.data.id as string;

  // 수정 이력 + 첨부 이전 버전
  await request(app)
    .put(`/api/posts/notice/${postId}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .field('title', '고친 제목')
    .field('content', '<p>고침</p>')
    .field('keepExistingFiles', 'true')
    .field('originalFilenames', JSON.stringify([name]))
    .attach('files', makeFile(name, '둘째 버전'));

  // 활동 기록
  await request(app)
    .patch(`/api/posts/notice/${postId}/task`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ workStatus: 'todo' });

  // 스크랩
  await request(app)
    .post(`/api/posts/notice/${postId}/scrap`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie);

  // 댓글 + 댓글 좋아요
  const comment = await request(app)
    .post(`/api/comments/notice/${postId}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ content: '댓글' });
  const commentId = comment.body.data?.id ?? comment.body.data?.comment?.id;
  if (commentId) {
    await request(app)
      .post(`/api/comments/${commentId}/like`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
  }

  const version = await PostAttachmentVersion.findOne({ where: { postId } });
  expect(version).not.toBeNull();
  const versionFile = path.resolve(process.cwd(), 'uploads/files', version!.filename);

  await request(app)
    .delete(`/api/posts/notice/${postId}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie);

  return { postId, versionFile };
}

describe('보관 기간이 지난 글의 영구 삭제', () => {
  it('딸린 기록과 파일이 모두 사라진다', async () => {
    const { postId, versionFile } = await makeRichPostAndDelete();

    // 보관 기간을 지난 것처럼 삭제 시각을 과거로 돌린다
    await Post.update(
      { deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      { where: { id: postId }, paranoid: false, silent: true }
    );

    const purged = await postService.purgeExpiredPosts(30);
    expect(purged).toBeGreaterThanOrEqual(1);

    // 글이 실제로 사라졌는지
    expect(await Post.findByPk(postId, { paranoid: false })).toBeNull();

    // 딸린 기록들
    expect(await PostRevision.count({ where: { postId } })).toBe(0);
    expect(await PostAttachmentVersion.count({ where: { postId } })).toBe(0);
    expect(await PostActivity.count({ where: { postId } })).toBe(0);
    expect(await PostScrap.count({ where: { PostId: postId } })).toBe(0);
    expect(await Comment.count({ where: { PostId: postId }, paranoid: false })).toBe(0);

    // 아무도 열 수 없는 파일이 남지 않아야 한다
    expect(fs.existsSync(versionFile)).toBe(false);
  });

  it('보관 기간이 남은 글의 기록은 건드리지 않는다', async () => {
    const { postId } = await makeRichPostAndDelete();

    await postService.purgeExpiredPosts(30);

    expect(await Post.findByPk(postId, { paranoid: false })).not.toBeNull();
    expect(await PostRevision.count({ where: { postId } })).toBeGreaterThan(0);
  });

  it('파일은 숨기는 시점에 이미 지운다 — 기록만 보관 기간을 갖는다', async () => {
    // 이 프로젝트의 정책이다: 지우기를 누른 순간 디스크의 파일은 사라지고,
    // DB 기록만 보관 기간 동안 남는다(첨부 본체가 이미 그렇게 동작한다).
    // 이전 버전 파일만 예외로 두면 아무도 열 수 없는 파일이 폴더에 남는다.
    const { versionFile } = await makeRichPostAndDelete();
    expect(fs.existsSync(versionFile)).toBe(false);
  });
});

describe('댓글 좋아요', () => {
  it('영구 삭제된 글의 댓글 좋아요가 남지 않는다', async () => {
    // 댓글은 bulk destroy 로 지워지는데, 그때는 Sequelize 훅이 돌지 않아
    // 연결된 좋아요가 조용히 남는다.
    const { postId } = await makeRichPostAndDelete();
    const commentIds = (
      await Comment.findAll({ where: { PostId: postId }, attributes: ['id'], paranoid: false })
    ).map(c => c.id);

    await Post.update(
      { deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
      { where: { id: postId }, paranoid: false, silent: true }
    );
    await postService.purgeExpiredPosts(30);

    if (commentIds.length > 0) {
      expect(await CommentLike.count({ where: { CommentId: commentIds } })).toBe(0);
    }
  });
});
