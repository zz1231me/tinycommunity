import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Comment } from '../models/Comment';

// 댓글 본문의 서버 정화.
//
// 이 앱은 위키·일정·게시글 본문을 모두 서버에서 sanitizeHtmlContent 로 지나게 하는데
// 댓글만 빠져 있었다. 화면(CommentSection)이 DOMPurify 로 정화하므로 지금 당장 터지는
// 구멍은 아니었지만, 그러면 화면 하나가 유일한 방어선이 된다 — 알림 미리보기·내보내기·
// 카드 스니펫처럼 화면을 거치지 않는 소비자가 하나 생기는 순간 저장된 스크립트가 그대로
// 실행된다. contentRenderer 의 주석이 바로 그것을 하지 말라고 적어 두고 있었다.
//
// 그래서 응답이 아니라 '저장된 값' 을 본다. 화면을 거치지 않는 경로가 문제이므로,
// DB 에 무엇이 들어갔는지가 이 검사의 대상이다.

const BOARD = 'notice';
let adminCookie: string;
let postId: string;

const write = (content: string) =>
  request(app)
    .post(`/api/comments/${BOARD}/${postId}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ content });

const edit = (commentId: number, content: string) =>
  request(app)
    .put(`/api/comments/${BOARD}/${commentId}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ content });

/** 저장된 원문 — 화면을 거치지 않은 값 */
const stored = async (commentId: number) => {
  const row = await Comment.findByPk(commentId, { attributes: ['id', 'content'] });
  return row?.content ?? '';
};

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');

  const created = await request(app)
    .post(`/api/posts/${BOARD}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title: `댓글 정화 ${Date.now()}`, content: '<p>x</p>' });
  expect(created.status).toBe(201);
  postId = created.body.data.id;
});

describe('댓글을 만들 때 정화한다', () => {
  it('script 태그는 저장되지 않는다', async () => {
    const res = await write('<p>멀쩡한 글</p><script>alert(1)</script>');
    expect(res.status).toBe(201);

    const content = await stored(res.body.data.id);
    expect(content).not.toContain('<script');
    expect(content).not.toContain('alert(1)');
  });

  it('이벤트 핸들러 속성도 남지 않는다', async () => {
    // 글자를 함께 넣는다. 컨트롤러의 길이 검사가 태그를 모두 걷어낸 뒤 세기 때문에
    // 이미지만 있는 댓글은 0자로 취급돼 정화 단계에 닿지도 못하고 400 으로 거절된다
    // (그 자체가 별개의 결함이라 따로 적어 뒀다).
    const res = await write('<p>사진 첨부</p><img src="x" onerror="alert(1)">');
    expect(res.status).toBe(201);

    const content = await stored(res.body.data.id);
    expect(content).not.toContain('onerror');
    expect(content).not.toContain('alert(1)');
  });

  it('멀쩡한 마크업은 그대로 남는다 — 양성 대조', async () => {
    // 이것이 없으면 '본문을 통째로 비우는' 구현도 위 두 검사를 통과한다
    const res = await write('<p>3층 회의실에서 <strong>2시</strong>에 봅시다</p>');
    expect(res.status).toBe(201);

    const content = await stored(res.body.data.id);
    expect(content).toContain('3층 회의실');
    expect(content).toContain('<strong>');
  });
});

describe('댓글을 고칠 때도 정화한다', () => {
  it('수정으로 우회할 수 없다', async () => {
    // 만들 때만 정화하면 '멀쩡하게 쓰고 나서 고치기' 로 그대로 넣을 수 있다
    const created = await write('<p>처음엔 멀쩡</p>');
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const res = await edit(id, '<p>이제</p><script>alert(2)</script>');
    expect(res.status).toBe(200);

    const content = await stored(id);
    expect(content).not.toContain('<script');
    expect(content).not.toContain('alert(2)');
  });

  it('수정해도 멀쩡한 마크업은 남는다 — 양성 대조', async () => {
    const created = await write('<p>처음</p>');
    const id = created.body.data.id;

    await edit(id, '<p>고친 뒤에도 <em>기울임</em>은 남는다</p>');

    const content = await stored(id);
    expect(content).toContain('<em>');
    expect(content).toContain('기울임');
  });
});

describe('길이 상한', () => {
  it('빈 태그를 수만 번 반복해도 막힌다', async () => {
    // 컨트롤러의 길이 검사는 태그를 걷어낸 '글자 수' 를 센다. 그래서 빈 태그만 반복하면
    // 0자로 세어져 그대로 통과했다 — 글자는 없는데 저장량은 수십 MB 가 된다.
    const res = await write('<b></b>'.repeat(20000));
    expect(res.status).toBe(400);
  });

  it('평범한 길이의 댓글은 통과한다 — 양성 대조', async () => {
    const res = await write('<p>보통 길이의 댓글</p>');
    expect(res.status).toBe(201);
  });
});
