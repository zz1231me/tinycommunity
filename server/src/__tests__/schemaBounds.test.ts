// server/src/__tests__/schemaBounds.test.ts
// 검증 상한이 DB 컬럼 상한과 맞는지.
//
// 어긋나 있으면 400 이어야 할 입력이 DB 까지 내려간다. SQLite 는 VARCHAR 길이와
// INTEGER 범위를 강제하지 않아 개발에서는 조용히 저장되지만(실측으로 확인했다),
// 이 프로젝트가 함께 지원하는 MySQL/MariaDB/PostgreSQL 에서는 오류가 된다.
//
// 정상 입력이 막히지 않는지도 함께 고정한다 — 상한을 넣다가 멀쩡한 값을 잠그면
// 버그를 고치면서 회귀를 넣는 셈이다.

import {
  registerSchema,
  createCommentSchema,
  updateMemoSchema,
  createTagSchema,
  attendanceCheckInSchema,
  attendanceChecklistUpdateSchema,
  attendanceReorderSchema,
} from '../validators/schemas';

const INT_MAX = 2147483647;
const base = { id: 'user1234', password: 'pw', name: 'n' };

describe('DB 컬럼 상한을 넘는 입력은 검증에서 막는다', () => {
  it('이메일 100자 초과 — User.email 은 STRING(100)', () => {
    expect(registerSchema.safeParse({ ...base, email: 'a'.repeat(288) + '@x.com' }).success).toBe(
      false
    );
  });

  it('부모 댓글 ID 가 INTEGER 범위를 넘으면 — 숫자로도 문자열로도', () => {
    expect(createCommentSchema.safeParse({ content: 'c', parentId: INT_MAX + 1 }).success).toBe(
      false
    );
    expect(
      createCommentSchema.safeParse({ content: 'c', parentId: '999999999999999999999' }).success
    ).toBe(false);
  });

  it('메모 order 가 INTEGER 범위를 넘으면', () => {
    expect(updateMemoSchema.safeParse({ order: INT_MAX + 1 }).success).toBe(false);
  });

  it('태그 boardId 50자 초과 — Tag.boardId 는 STRING(50)', () => {
    expect(createTagSchema.safeParse({ name: 't', boardId: 'b'.repeat(200) }).success).toBe(false);
  });

  it('출퇴근 항목 id 와 정렬 id 도 INTEGER 범위 안이어야 한다', () => {
    expect(
      attendanceCheckInSchema.safeParse({ responses: [{ itemId: INT_MAX + 1, checked: true }] })
        .success
    ).toBe(false);
    expect(attendanceChecklistUpdateSchema.safeParse({ order: INT_MAX + 1 }).success).toBe(false);
    expect(attendanceReorderSchema.safeParse({ ids: [INT_MAX + 1] }).success).toBe(false);
  });
});

describe('정상 입력은 그대로 통과한다', () => {
  it('이메일 — 정상·생략·빈문자열·경계값', () => {
    expect(registerSchema.safeParse({ ...base, email: 'a@x.com' }).success).toBe(true);
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, email: '' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, email: 'a'.repeat(92) + '@x.com' }).success).toBe(
      true
    );
  });

  it('부모 댓글 ID — 숫자·문자열·null·생략', () => {
    expect(createCommentSchema.safeParse({ content: 'c', parentId: 3 }).success).toBe(true);
    expect(createCommentSchema.safeParse({ content: 'c', parentId: '3' }).success).toBe(true);
    expect(createCommentSchema.safeParse({ content: 'c', parentId: null }).success).toBe(true);
    expect(createCommentSchema.safeParse({ content: 'c' }).success).toBe(true);
  });

  it('경계값 자체는 허용한다', () => {
    expect(updateMemoSchema.safeParse({ order: 0 }).success).toBe(true);
    expect(updateMemoSchema.safeParse({ order: INT_MAX }).success).toBe(true);
    expect(createTagSchema.safeParse({ name: 't', boardId: 'b'.repeat(50) }).success).toBe(true);
    expect(createTagSchema.safeParse({ name: 't', boardId: null }).success).toBe(true);
  });
});
