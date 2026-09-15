// client/src/hooks/useCommentOperations.test.tsx
// 댓글 쓰기·수정·삭제는 성공했는데 목록 새로고침만 실패하는 경우가 있다
// (일시적인 네트워크 오류, 요청 수 제한 등). 그때 "실패했습니다" 라고 알리면
// 사용자는 다시 올린다 — 댓글이 두 번 달리고, 지운 글은 지워지지 않은 것처럼 보인다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCommentOperations } from './useCommentOperations';

const post = vi.fn();
const put = vi.fn();
const del = vi.fn();

vi.mock('../api/axios', () => ({
  default: {
    post: (...a: unknown[]) => post(...a),
    put: (...a: unknown[]) => put(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}));

vi.mock('../store/auth', () => ({
  useAuth: () => ({
    getUserId: () => 'u1',
    getUser: () => ({ id: 'u1', name: '나', avatar: null }),
  }),
}));

vi.mock('../store/siteSettings', () => ({
  useSiteSettings: (sel: (s: unknown) => unknown) =>
    sel({ settings: { commentContentMaxLength: 1000 } }),
}));

/** 쓰기는 되지만 목록 갱신은 실패하는 상황 */
const failingRefresh = () => Promise.reject(new Error('새로고침 실패'));

function setup(onRefresh: () => Promise<void>) {
  return renderHook(() =>
    useCommentOperations({
      boardType: 'notice',
      postId: '1',
      onRefresh,
    })
  );
}

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} });
  put.mockReset().mockResolvedValue({ data: {} });
  del.mockReset().mockResolvedValue({ data: {} });
});

describe('새로고침만 실패했을 때', () => {
  it('댓글 작성 — 실패로 알리지 않고 입력칸도 되살리지 않는다', async () => {
    const { result } = setup(failingRefresh);
    const setComments = vi.fn();

    act(() => result.current.setNewComment('<p>안녕</p>'));
    await act(async () => {
      await result.current.handleSubmit(setComments);
    });

    expect(post).toHaveBeenCalledTimes(1);
    // 다시 올리게 만들면 댓글이 두 번 달린다
    expect(result.current.submitError).toBe('');
    expect(result.current.newComment).toBe('');
  });

  it('댓글 수정 — 실패로 알리지 않고 편집 상태도 닫힌다', async () => {
    const { result } = setup(failingRefresh);

    act(() => result.current.handleEditStart({ id: 7, content: '<p>원본</p>' } as never));
    act(() => result.current.setEditContent('<p>고침</p>'));
    await act(async () => {
      await result.current.handleEditSave(7);
    });

    expect(put).toHaveBeenCalledTimes(1);
    expect(result.current.editError).toBe('');
    expect(result.current.editingCommentId).toBeNull();
  });

  it('댓글 삭제 — 실패로 알리지 않는다', async () => {
    const { result } = setup(failingRefresh);

    await act(async () => {
      await result.current.handleDelete(7);
    });

    expect(del).toHaveBeenCalledTimes(1);
    expect(result.current.deleteError).toBe('');
  });

  it('답글 — 실패로 알리지 않는다', async () => {
    const { result } = setup(failingRefresh);

    act(() => result.current.setReplyContent('<p>답글</p>'));
    await act(async () => {
      await result.current.handleReplySubmit(7);
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.replyError).toBe('');
  });
});

describe('쓰기 자체가 실패했을 때는', () => {
  it('실패로 알리고 쓴 내용을 되살린다', async () => {
    post.mockRejectedValue({ response: { data: { message: '권한이 없습니다.' } } });
    const { result } = setup(() => Promise.resolve());
    const setComments = vi.fn();

    act(() => result.current.setNewComment('<p>안녕</p>'));
    await act(async () => {
      await result.current.handleSubmit(setComments);
    });

    expect(result.current.submitError).toBe('권한이 없습니다.');
    expect(result.current.newComment).toBe('<p>안녕</p>');
  });
});
