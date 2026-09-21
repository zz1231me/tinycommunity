// 글 고정 단추. 글 사이를 오갈 때 늦게 도착한 응답이 다른 글을 건드리면 안 된다.

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const togglePin = vi.fn();
vi.mock('../../api/posts', () => ({ togglePin: (...a: unknown[]) => togglePin(...a) }));

import { PinButton } from './PinButton';

const open = () => screen.getByRole('button', { name: '게시글 고정' });

describe('글 고정', () => {
  it('원하는 상태를 보낸다 — 뒤집기로 보내면 화면이 낡았을 때 반대로 걸린다', async () => {
    togglePin.mockResolvedValue({ isPinned: true, pinnedUntil: null });
    const onChange = vi.fn();
    render(
      <PinButton
        boardType="notice"
        postId="p1"
        isPinned={false}
        pinnedUntil={null}
        onChange={onChange}
      />
    );

    fireEvent.click(open());
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '7일' }));
    });

    expect(togglePin).toHaveBeenCalledWith('notice', 'p1', expect.any(Date), true);
  });

  it('해제도 원하는 상태로 보낸다', async () => {
    togglePin.mockResolvedValue({ isPinned: false, pinnedUntil: null });
    render(
      <PinButton boardType="notice" postId="p1" isPinned pinnedUntil={null} onChange={vi.fn()} />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '고정 해제' }));
    });

    expect(togglePin).toHaveBeenCalledWith('notice', 'p1', null, false);
  });

  it('다른 글로 옮겨 간 뒤 도착한 응답은 부모에 전하지 않는다', async () => {
    // 글 상세는 살아 있고 이 단추만 사라진다. 그대로 전하면 다른 글이 고정된 것처럼 보이고,
    // 그 상태에서 '고정 해제' 를 누르면 실제로는 그 글이 고정된다.
    let resolve!: (v: unknown) => void;
    togglePin.mockReturnValue(new Promise(r => (resolve = r)));
    const onChange = vi.fn();
    const { unmount } = render(
      <PinButton boardType="notice" postId="p1" isPinned pinnedUntil={null} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: '고정 해제' }));
    unmount(); // 다른 글로 이동

    await act(async () => {
      resolve({ isPinned: false, pinnedUntil: null });
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
