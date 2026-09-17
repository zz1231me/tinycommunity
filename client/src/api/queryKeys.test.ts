// 게시판을 옮길 때 이전 게시판의 목록이 잠깐 남지 않는지 확인한다.
import { describe, expect, it } from 'vitest';
import { boardKeys, keepIfSameBoard } from './queryKeys';

const prev = ['A 게시판 글'];

describe('keepIfSameBoard', () => {
  it('같은 게시판에서 쪽을 넘기면 이전 목록을 유지한다', () => {
    const key = boardKeys.posts('qcboard', { page: 1 });
    expect(keepIfSameBoard(prev, key, 'qcboard')).toBe(prev);
  });

  it('같은 게시판에서 검색·태그가 바뀌어도 유지한다', () => {
    const key = boardKeys.posts('qcboard', { page: 1, search: '툴바' });
    expect(keepIfSameBoard(prev, key, 'qcboard')).toBe(prev);
  });

  it('게시판이 바뀌면 버린다', () => {
    const key = boardKeys.posts('qcboard', { page: 1 });
    expect(keepIfSameBoard(prev, key, 'qa_b100')).toBeUndefined();
  });

  it('이전 키가 없으면(첫 조회) 버린다', () => {
    expect(keepIfSameBoard(prev, undefined, 'qcboard')).toBeUndefined();
  });
});
