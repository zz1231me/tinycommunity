// 본문이 빈 글도 열려야 한다.
//
// 업무 게시판의 하위 업무('할 일을 한 줄로')는 제목만 있는 글로 만들어진다
// (서버의 addSubtask 가 content: '' 로 넣는다). 그런데 글을 받아 오는 쪽이 빈 본문을
// 오류로 보고 있어서, 그렇게 만든 줄을 누르면 상세 화면에 이렇게 떴다.
//
//   오류가 발생했습니다 — 게시글 제목 또는 내용이 없습니다
//
// 서버에는 글이 멀쩡히 있고 목록에도 보이는데 열리지만 않으니, 쓰는 사람에게는
// '없는 게시물' 처럼 보인다. 빈 본문은 오류가 아니라 그냥 빈 본문이다 —
// 열어서 수정으로 내용을 채울 수 있어야 한다.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());
vi.mock('./axios', () => ({ default: { get: mockGet } }));

import { fetchPostById } from './posts';

const reply = (data: unknown) => ({ data: { success: true, data } });

const BASE = {
  id: 'CHILD1',
  boardType: 'work',
  title: '특이사항 메모',
  author: '나',
  UserId: 'u1',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  attachments: [],
};

beforeEach(() => vi.clearAllMocks());

describe('본문이 빈 글', () => {
  it('하위 업무처럼 제목만 있는 글도 받아 온다', async () => {
    mockGet.mockResolvedValue(reply({ ...BASE, content: '' }));

    const post = await fetchPostById('work', 'CHILD1');

    expect(post.title).toBe('특이사항 메모');
    expect(post.content).toBe('');
  });

  it('본문이 있는 글은 그대로 — 양성 대조', async () => {
    mockGet.mockResolvedValue(reply({ ...BASE, content: '<p>내용</p>' }));

    expect((await fetchPostById('work', 'CHILD1')).content).toBe('<p>내용</p>');
  });

  it('제목이 없으면 여전히 거절한다 — 그건 깨진 데이터다', async () => {
    mockGet.mockResolvedValue(reply({ ...BASE, title: '', content: '<p>x</p>' }));

    await expect(fetchPostById('work', 'CHILD1')).rejects.toThrow();
  });
});
