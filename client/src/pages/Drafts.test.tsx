// client/src/pages/Drafts.test.tsx
//
// 되돌릴 수 없는 삭제는 한 번 묻는가.
//
// 임시저장은 휴지통을 누르는 즉시 사라졌다 — 잘못 누르면 되찾을 길이 없다.
// 글·메모·일정·관리자 화면은 모두 확인을 받는데 이 화면만 빠져 있었다.

import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithQuery } from '../test/renderWithQuery';
import Drafts from './Drafts';

const show = () =>
  renderWithQuery(
    <MemoryRouter>
      <Drafts />
    </MemoryRouter>
  );

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    { get: (_t, tag: string) => (p: Record<string, unknown>) => createElement(tag, p) }
  ),
  AnimatePresence: ({ children }: { children?: unknown }) => children,
}));

const fetchDrafts = vi.hoisted(() => vi.fn());
const deleteDraft = vi.hoisted(() => vi.fn());
vi.mock('../api/drafts', () => ({ fetchDrafts, deleteDraft }));

const draft = {
  id: 'D1',
  title: '쓰다 만 글',
  boardType: 'notice',
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchDrafts.mockResolvedValue([draft]);
  deleteDraft.mockResolvedValue({});
});

describe('임시저장 삭제', () => {
  it('휴지통을 눌러도 바로 지우지 않고 묻는다', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: /삭제/ }));

    expect(await screen.findByText(/이 임시저장을 지울까요/)).toBeInTheDocument();
    expect(deleteDraft).not.toHaveBeenCalled();
  });

  it('확인을 눌러야 지운다', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: /삭제/ }));
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));

    await waitFor(() => expect(deleteDraft).toHaveBeenCalledWith('D1'));
  });

  it('취소하면 그대로 둔다', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: /삭제/ }));
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));

    await waitFor(() =>
      expect(screen.queryByText(/이 임시저장을 지울까요/)).not.toBeInTheDocument()
    );
    expect(deleteDraft).not.toHaveBeenCalled();
  });
});
