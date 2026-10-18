// 글 본문의 서버 정화.
//
// 댓글·일정·위키는 저장 전에 씻는데 글 본문만 빠져 있었다. 읽을 때
// renderContentToHTML 이 씻어 주지만, 상세 응답에는 원본 content 가 함께 실려 나간다 —
// 재어 보니 <script> 와 onerror 가 DB 와 응답에 그대로 남아 있었다.
//
// 지금 화면은 DOMPurify 로 한 번 더 걸러 터지지는 않는다. 하지만 그러면 화면 하나가
// 유일한 방어선이 된다. 이 프로젝트가 댓글에서 똑같은 이유로 이미 고친 구조다
// (commentSanitize.test.ts). 저장되는 값 자체를 본다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Post } from '../models/Post';

const BOARD = 'notice';
let cookie: string;

const write = (content: string, title = `정화 ${Date.now()}${Math.random()}`) =>
  request(app)
    .post(`/api/posts/${BOARD}`)
    .set(CSRF_HEADER)
    .set('Cookie', cookie)
    .send({ title, content });

/** 저장된 원문 — 화면을 거치지 않은 값 */
const stored = async (id: string) => (await Post.findByPk(id))?.content ?? '';

beforeAll(async () => {
  await seedTestData();
  cookie = await loginAs('admin', 'TestAdmin123!');
});

describe('글을 쓸 때 본문을 정화한다', () => {
  it('script 태그는 저장되지 않는다', async () => {
    const res = await write('<p>남는 글</p><script>alert(1)</script>');
    expect(res.status).toBe(201);

    const content = await stored(res.body.data.id);
    expect(content).not.toContain('<script');
    expect(content).not.toContain('alert(1)');
    // 통째로 비우는 구현도 막는다
    expect(content).toContain('남는 글');
  });

  it('이벤트 핸들러 속성도 남지 않는다', async () => {
    const res = await write('<p>글</p><img src="x" onerror="alert(1)">');
    expect(await stored(res.body.data.id)).not.toContain('onerror');
  });

  it('응답에도 섞여 나가지 않는다 — 화면 말고 다른 소비자를 위해', async () => {
    const res = await write('<p>글</p><script>alert(1)</script>');
    const detail = await request(app)
      .get(`/api/posts/${BOARD}/${res.body.data.id}`)
      .set('Cookie', cookie);

    expect(JSON.stringify(detail.body.data)).not.toContain('<script');
  });

  it('고칠 때도 정화한다', async () => {
    const made = await write('<p>처음</p>');
    const id = made.body.data.id as string;

    const res = await request(app)
      .put(`/api/posts/${BOARD}/${id}`)
      .set(CSRF_HEADER)
      .set('Cookie', cookie)
      .field('title', '고친 제목')
      .field('content', '<p>고친 글</p><script>alert(1)</script>');
    expect(res.status).toBe(200);

    const content = await stored(id);
    expect(content).not.toContain('<script');
    expect(content).toContain('고친 글');
  });

  it('멀쩡한 서식은 그대로 남는다 — 양성 대조', async () => {
    // 이것이 없으면 '태그를 전부 지우는' 구현도 위를 모두 통과한다
    const res = await write(
      '<h2>제목</h2><p><strong>굵게</strong> 와 <a href="https://example.com">링크</a></p><ul><li>목록</li></ul>'
    );

    const content = await stored(res.body.data.id);
    for (const keep of ['<h2>', '<strong>', '<a href="https://example.com"', '<li>']) {
      expect(content).toContain(keep);
    }
  });

  it('TipTap JSON 본문은 모양이 망가지지 않는다 — 옛 글이 섞여 있다', async () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '제이슨 본문' }] }],
    });
    const res = await write(doc);

    const content = await stored(res.body.data.id);
    expect(() => JSON.parse(content)).not.toThrow();
    expect(JSON.parse(content).type).toBe('doc');
  });
});
