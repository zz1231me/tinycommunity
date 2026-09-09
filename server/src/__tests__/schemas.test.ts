// server/src/__tests__/schemas.test.ts
// validateBody 는 req.body 를 파싱 결과로 "교체"하므로, 스키마에 없는 키는 조용히 사라진다.
// 컨트롤러가 읽는 필드가 스키마에 모두 있는지를 여기서 고정해 둔다.

import {
  createCommentSchema,
  createMemoSchema,
  createTagSchema,
  updateCommentSchema,
  updateMemoSchema,
  updateTagSchema,
} from '../validators/schemas';

describe('createCommentSchema', () => {
  it('내용만 있어도 통과한다', () => {
    const r = createCommentSchema.safeParse({ content: '안녕하세요' });
    expect(r.success).toBe(true);
  });

  it('빈 내용은 거부한다', () => {
    expect(createCommentSchema.safeParse({ content: '' }).success).toBe(false);
  });

  it('parentId 를 문자열로 받아도 숫자로 변환해 통과시킨다(폼 전송 대비)', () => {
    const r = createCommentSchema.safeParse({ content: 'x', parentId: '12' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBe(12);
  });

  it('0 이하·소수점 parentId 는 거부한다', () => {
    expect(createCommentSchema.safeParse({ content: 'x', parentId: 0 }).success).toBe(false);
    expect(createCommentSchema.safeParse({ content: 'x', parentId: -1 }).success).toBe(false);
    expect(createCommentSchema.safeParse({ content: 'x', parentId: 1.5 }).success).toBe(false);
  });

  it('parentId 는 null 을 허용한다(최상위 댓글)', () => {
    expect(createCommentSchema.safeParse({ content: 'x', parentId: null }).success).toBe(true);
  });

  it('updateCommentSchema 는 content 를 보존한다', () => {
    const r = updateCommentSchema.safeParse({ content: '수정됨' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.content).toBe('수정됨');
  });
});

describe('메모 스키마', () => {
  it('생성 시 제목·내용이 모두 비어 있으면 거부한다', () => {
    expect(createMemoSchema.safeParse({ title: '  ', content: '' }).success).toBe(false);
    expect(createMemoSchema.safeParse({}).success).toBe(false);
  });

  it('생성 시 내용만 있어도 통과한다', () => {
    expect(createMemoSchema.safeParse({ content: '메모' }).success).toBe(true);
  });

  it('허용되지 않은 색상은 거부한다', () => {
    expect(createMemoSchema.safeParse({ content: 'x', color: 'orange' }).success).toBe(false);
    expect(createMemoSchema.safeParse({ content: 'x', color: 'yellow' }).success).toBe(true);
  });

  it('수정 스키마는 isPinned·order 를 보존한다 (누락 시 고정·정렬이 조용히 무시된다)', () => {
    const r = updateMemoSchema.safeParse({ isPinned: true, order: 3 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.isPinned).toBe(true);
      expect(r.data.order).toBe(3);
    }
  });

  it('수정 스키마는 고정만 토글하는 요청을 허용한다(제목·내용 없이도)', () => {
    expect(updateMemoSchema.safeParse({ isPinned: true }).success).toBe(true);
  });

  it('order 는 음수를 거부한다', () => {
    expect(updateMemoSchema.safeParse({ order: -1 }).success).toBe(false);
  });
});

describe('태그 스키마', () => {
  it('이름은 필수이며 앞뒤 공백은 제거된다', () => {
    const r = createTagSchema.safeParse({ name: '  공지  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('공지');
    expect(createTagSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('3자리 축약 HEX 색상도 허용한다(기존 컨트롤러 규칙과 동일)', () => {
    expect(createTagSchema.safeParse({ name: 't', color: '#f00' }).success).toBe(true);
    expect(createTagSchema.safeParse({ name: 't', color: '#3b82f6' }).success).toBe(true);
    expect(createTagSchema.safeParse({ name: 't', color: 'red' }).success).toBe(false);
  });

  it('50자를 넘는 이름과 500자를 넘는 설명을 거부한다', () => {
    expect(createTagSchema.safeParse({ name: 'a'.repeat(51) }).success).toBe(false);
    expect(createTagSchema.safeParse({ name: 't', description: 'a'.repeat(501) }).success).toBe(
      false
    );
  });

  it('boardId 는 null 을 허용한다(전역 태그)', () => {
    expect(createTagSchema.safeParse({ name: 't', boardId: null }).success).toBe(true);
  });

  it('수정 스키마는 모든 필드를 선택적으로 받는다', () => {
    expect(updateTagSchema.safeParse({}).success).toBe(true);
    expect(updateTagSchema.safeParse({ color: '#abc' }).success).toBe(true);
  });
});
