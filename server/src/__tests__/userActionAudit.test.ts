// server/src/__tests__/userActionAudit.test.ts
// 일반 사용자가 무엇을 지웠는지 남는가.
//
// 감사 로그는 스키마부터 관리자 전용이었다(컬럼이 adminId/adminName). 일반 사용자가
// 글·댓글·위키를 지워도 아무 데도 남지 않아, 사라진 뒤에는 무엇이 있었는지 알 길이 없었다.
//
// 되돌릴 수 없는 삭제만 남긴다. 생성·수정은 엔티티 자체에 흔적이 남지만(작성일·수정일)
// 지워진 것은 그렇지 않다. 전부 남기면 양이 폭발해 정작 중요한 것이 묻힌다 —
// 그 결정을 아래 '만들 때는 남기지 않는다' 로 고정한다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { auditLogService } from '../services/auditLog.service';
import { AuditLog } from '../models/AuditLog';

type AuditRow = {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetName?: string | null;
  ipAddress?: string | null;
};

let adminCookie = '';
let spy: jest.SpyInstance;

const rows = (): AuditRow[] => spy.mock.calls.map(c => c[0] as unknown as AuditRow);
const byAction = (action: string): AuditRow[] => rows().filter(r => r.action === action);
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function createPost(): Promise<{ id: string; title: string }> {
  const title = `감사 대상 글 ${uniq()}`;
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title, content: '<p>지워질 내용</p>' });
  expect(res.status).toBe(201);
  return { id: res.body.data.id as string, title };
}

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

beforeEach(() => {
  // DB 에 실제로 쓰지 않고 "무엇을 남기려 했는가" 만 본다.
  spy = jest.spyOn(auditLogService, 'createAuditLog').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('지운 것이 기록에 남는다', () => {
  it('글을 지우면 제목과 함께 남는다 — 지운 뒤에는 제목을 알 수 없다', async () => {
    const post = await createPost();

    const res = await request(app)
      .delete(`/api/posts/notice/${post.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    const hits = byAction('delete_post');
    expect(hits).toHaveLength(1);
    expect(hits[0].targetType).toBe('post');
    expect(hits[0].targetId).toBe(post.id);
    expect(hits[0].targetName).toBe(post.title);
  });

  it('댓글을 지우면 내용 발췌와 함께 남는다', async () => {
    const post = await createPost();
    const created = await request(app)
      .post(`/api/comments/notice/${post.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ content: '<p>지워질 댓글 내용</p>' });
    expect(created.status).toBe(201);
    const commentId = created.body.data?.id ?? created.body.data?.comment?.id;

    spy.mockClear(); // 글·댓글 생성 단계의 호출과 섞이지 않게

    const res = await request(app)
      .delete(`/api/comments/notice/${commentId}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    const hits = byAction('delete_comment');
    expect(hits).toHaveLength(1);
    expect(hits[0].targetType).toBe('comment');
    expect(hits[0].targetId).toBe(String(commentId));
    // 태그를 벗긴 발췌가 남아야 한다
    expect(hits[0].targetName).toContain('지워질 댓글 내용');
    expect(hits[0].targetName).not.toContain('<p>');
  });

  it('위키를 지우면 제목과 함께 남는다', async () => {
    const slug = `w-${uniq()}`;
    const created = await request(app)
      .post('/api/wiki')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ slug, title: '지워질 위키' });
    expect(created.status).toBe(201);

    spy.mockClear();

    const res = await request(app)
      .delete(`/api/wiki/${slug}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    const hits = byAction('delete_wiki_page');
    expect(hits).toHaveLength(1);
    expect(hits[0].targetType).toBe('wiki');
    expect(hits[0].targetName).toBe('지워질 위키');
  });

  it('누가 어디서 지웠는지 함께 남는다', async () => {
    const post = await createPost();
    spy.mockClear();

    await request(app)
      .delete(`/api/posts/notice/${post.id}`)
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie);

    const hit = byAction('delete_post')[0];
    expect(hit.actorId).toBe('admin');
    expect(hit.actorName).toBeTruthy();
    expect(hit.ipAddress).toBeTruthy();
  });
});

describe('만들 때는 남기지 않는다 — 음성 대조', () => {
  it('글을 만드는 것만으로는 감사 기록이 생기지 않는다', async () => {
    await createPost();
    expect(byAction('delete_post')).toHaveLength(0);
    // 생성 계열 행위를 새로 남기기로 바꾼다면 이 단언이 먼저 알려 준다
    expect(rows().some(r => r.targetType === 'post')).toBe(false);
  });
});

describe('감사 로그도 컬럼 폭을 지킨다', () => {
  it('긴 targetName 은 200자로 잘린다', async () => {
    jest.restoreAllMocks(); // 서비스는 실제로 돌리고, 모델 단계에서 가로챈다
    const create = jest.spyOn(AuditLog, 'create').mockResolvedValue({} as unknown as AuditLog);

    await auditLogService.createAuditLog({
      actorId: 'admin',
      actorName: '관리자',
      action: 'delete_post',
      targetType: 'post',
      targetId: 'p1',
      targetName: '가'.repeat(300),
    });

    const saved = create.mock.calls[0][0] as { targetName: string };
    expect(saved.targetName).toHaveLength(200);
  });
});
