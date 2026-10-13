// 글쓰기의 템플릿 고르기.
//
// 컨플루언스의 template 자리다. 지켜야 할 선은 ① 틀이 없으면 단추도 없다
// ② 고르면 제목·본문을 채운다 ③ 이미 쓴 내용을 말없이 덮지 않는다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { TemplatePicker } from './TemplatePicker';
import { renderWithQuery } from '../../test/renderWithQuery';
import type { PostTemplate } from '../../api/postTemplates';

const mockFetch = vi.fn();
vi.mock('../../api/postTemplates', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/postTemplates')>()),
  fetchPostTemplates: (boardType?: string) => mockFetch(boardType),
}));

const template = (over: Partial<PostTemplate> = {}): PostTemplate => ({
  id: 1,
  name: '주간 회의록',
  description: '안건·결정·할 일',
  boardType: null,
  title: '주간 회의록 (10/13)',
  content: '<h2>안건</h2>',
  ...over,
});

const show = (hasContent = false) => {
  const onPick = vi.fn();
  renderWithQuery(<TemplatePicker boardType="notice" hasContent={hasContent} onPick={onPick} />);
  return onPick;
};

beforeEach(() => {
  vi.clearAllMocks();
});

/** 앱의 대화상자에서 '바꾸기'/'취소' 를 누른다 */
const answer = async (label: '바꾸기' | '취소') =>
  fireEvent.click(await screen.findByRole('button', { name: label }));

describe('템플릿 고르기', () => {
  it('고를 틀이 없으면 단추도 그리지 않는다', async () => {
    mockFetch.mockResolvedValue([]);
    show();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('notice'));
    expect(screen.queryByRole('button', { name: '템플릿' })).not.toBeInTheDocument();
  });

  it('이름과 설명을 보여 주고, 고르면 그 틀을 넘긴다', async () => {
    mockFetch.mockResolvedValue([template()]);
    const onPick = show();

    fireEvent.click(await screen.findByRole('button', { name: '템플릿' }));
    expect(screen.getByText('안건·결정·할 일')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /주간 회의록/ }));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('이미 쓴 내용이 있으면 한 번 묻고, 그래 하면 바꾼다', async () => {
    mockFetch.mockResolvedValue([template()]);
    const onPick = show(true);

    fireEvent.click(await screen.findByRole('button', { name: '템플릿' }));
    fireEvent.click(screen.getByRole('button', { name: /주간 회의록/ }));

    expect(await screen.findByText(/틀로 바꿀까요\?/)).toBeInTheDocument();
    await answer('바꾸기');
    await waitFor(() => expect(onPick).toHaveBeenCalled());
  });

  it('묻는 말에 아니라고 하면 덮지 않는다', async () => {
    mockFetch.mockResolvedValue([template()]);
    const onPick = show(true);

    fireEvent.click(await screen.findByRole('button', { name: '템플릿' }));
    fireEvent.click(screen.getByRole('button', { name: /주간 회의록/ }));
    await answer('취소');

    await waitFor(() => expect(onPick).not.toHaveBeenCalled());
  });

  it('빈 글에서는 묻지 않고 바로 채운다', async () => {
    mockFetch.mockResolvedValue([template()]);
    const onPick = show(false);

    fireEvent.click(await screen.findByRole('button', { name: '템플릿' }));
    fireEvent.click(screen.getByRole('button', { name: /주간 회의록/ }));

    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(screen.queryByText(/틀로 바꿀까요\?/)).not.toBeInTheDocument();
  });
});
