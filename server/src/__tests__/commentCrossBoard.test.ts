// 댓글 주소의 게시판 칸을 바꿔치기하는 것.
//
// 댓글 경로는 /api/comments/:boardType/:commentId 인데, 미들웨어(checkReadAccess 등)는
// URL 의 boardType 만 본다 — 내가 들어갈 수 있는 게시판 이름을 적으면 미들웨어는 통과한다.
// 그래서 컨트롤러가 '이 댓글이 정말 그 게시판 글에 달린 것인지' 를 다시 확인한다.
// 네 곳(수정·삭제·좋아요·반응)이 같은 확인을 각자 적고 있어, 한 곳만 빠져도 조용하다.
// 하위 업무에서 똑같은 종류의 구멍을 이미 한 번 봤다. 여기에 그물을 둔다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Board } from '../models/Board';
import { BoardAccess } from '../models/BoardAccess';

const REAL = 'notice'; // 댓글이 실제로 달린 게시판
const OTHER = 'xboard'; // 내가 들어갈 수는 있지만 이 댓글과 무관한 게시판

let adminCookie: string;
let commentId: number;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');

  await Board.findOrCreate({
    where: { id: OTHER },
    defaults: {
      id: OTHER,
      name: '다른 게시판',
      description: '교차 검증용',
      isPersonal: false,
      isActive: true,
      order: 99,
    },
  });
  await BoardAccess.findOrCreate({
    where: { boardId: OTHER, roleId: 'admin' },
    defaults: { boardId: OTHER, roleId: 'admin', canRead: true, canWrite: true, canDelete: true },
  });

  const post = await request(app)
    .post(`/api/posts/${REAL}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title: `교차 ${Date.now()}`, content: '<p>x</p>' });
  expect(post.status).toBe(201);

  const comment = await request(app)
    .post(`/api/comments/${REAL}/${post.body.data.id}`)
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ content: '원래 내용' });
  expect(comment.status).toBe(201);
  commentId = comment.body.data.id;
});

/** 같은 요청을 게시판 칸만 바꿔 두 번 보낸다. */
const send = (board: string, what: 'update' | 'delete' | 'like' | 'react') => {
  switch (what) {
    case 'update':
      return request(app)
        .put(`/api/comments/${board}/${commentId}`)
        .set(CSRF_HEADER)
        .set('Cookie', adminCookie)
        .send({ content: '바뀐 내용' });
    case 'delete':
      return request(app)
        .delete(`/api/comments/${board}/${commentId}`)
        .set(CSRF_HEADER)
        .set('Cookie', adminCookie);
    case 'like':
      return request(app)
        .post(`/api/comments/${board}/${commentId}/like`)
        .set(CSRF_HEADER)
        .set('Cookie', adminCookie);
    case 'react':
      return request(app)
        .post(`/api/comments/${board}/${commentId}/reactions`)
        .set(CSRF_HEADER)
        .set('Cookie', adminCookie)
        .send({ emoji: '👍' });
  }
};

describe('다른 게시판 이름으로 남의 댓글에 손대기', () => {
  it.each(['update', 'like', 'react'] as const)('%s 는 404 로 막힌다', async what => {
    const res = await send(OTHER, what);
    expect(res.status).toBe(404);
  });

  // 지우기는 마지막에 — 성공하면 뒤 검사가 의미를 잃는다
  it('delete 는 404 로 막히고, 댓글은 그대로 남는다', async () => {
    const res = await send(OTHER, 'delete');
    expect(res.status).toBe(404);

    const still = await send(REAL, 'like');
    expect(still.status).toBe(200);
  });

  it('제 게시판 이름으로는 통한다 — 양성 대조', async () => {
    // 이것이 없으면 '무조건 404' 인 구현도 위를 모두 통과한다
    expect((await send(REAL, 'update')).status).toBe(200);
    expect((await send(REAL, 'react')).status).toBe(200);
    expect((await send(REAL, 'delete')).status).toBe(200);
  });
});
