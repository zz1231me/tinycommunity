// 태그 고르기.
//
// 글쓰기 화면은 세로가 아쉽다. 고를 태그가 하나도 없는 게시판에서 '등록된 태그가 없습니다'
// 한 줄 때문에 제목 아래가 60px 밀렸다 — 그 경우에는 제목째 사라진다.
// 관리 화면처럼 '없다' 는 사실을 보여 줘야 하는 곳도 있어 기본값은 그대로 둔다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TagSelector } from './TagSelector';
import { useFeatures } from '../../store/features';

const getTags = vi.hoisted(() => vi.fn());
vi.mock('../../api/tags', () => ({ getTags }));

const tag = (id: number, name: string) => ({ id, name, color: '#888' });

beforeEach(() => {
  vi.clearAllMocks();
  useFeatures.setState({ features: { 'post.tags': true } as never, hidden: [] });
});

describe('태그 고르기', () => {
  it('고를 태그가 없고 숨기라고 하면 제목까지 아무것도 그리지 않는다', async () => {
    getTags.mockResolvedValue([]);
    const { container } = render(
      <TagSelector label="태그" hideWhenEmpty selectedTags={[]} onChange={() => {}} />
    );

    await waitFor(() => expect(getTags).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('숨기라고 하지 않으면 없다고 말한다 — 관리 화면의 몫', async () => {
    getTags.mockResolvedValue([]);
    render(<TagSelector selectedTags={[]} onChange={() => {}} />);

    expect(await screen.findByText('등록된 태그가 없습니다.')).toBeInTheDocument();
  });

  it('태그가 있으면 제목과 함께 그린다', async () => {
    getTags.mockResolvedValue([tag(1, '회의록')]);
    render(<TagSelector label="태그" hideWhenEmpty selectedTags={[]} onChange={() => {}} />);

    expect(await screen.findByRole('button', { name: /회의록/ })).toBeInTheDocument();
    expect(screen.getByText('태그')).toBeInTheDocument();
  });

  it('기능이 꺼져 있으면 아무것도 그리지 않는다', () => {
    useFeatures.setState({ features: { 'post.tags': false } as never, hidden: [] });
    getTags.mockResolvedValue([tag(1, '회의록')]);
    const { container } = render(
      <TagSelector label="태그" selectedTags={[]} onChange={() => {}} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
