// '되돌리기' 토스트. 무르기는 한 번만 일어나야 한다 — 두 번 불리면 방금 무른 것을 다시 무른다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { toast } from './toast';

describe('toast.undo', () => {
  beforeEach(() => document.getElementById('app-toast-action-container')?.remove());

  it('되돌리기 단추를 누르면 한 번만 무른다', () => {
    const onUndo = vi.fn();
    toast.undo('완료로 옮겼습니다.', onUndo);
    const button = screen.getByRole('button', { name: '되돌리기' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('토스트를 눌러 닫는 것은 무르기가 아니다', () => {
    const onUndo = vi.fn();
    toast.undo('완료로 옮겼습니다.', onUndo);
    fireEvent.click(screen.getByText('완료로 옮겼습니다.'));
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('시간이 지나면 사라진다', () => {
    vi.useFakeTimers();
    try {
      toast.undo('완료로 옮겼습니다.', vi.fn(), 1000);
      vi.advanceTimersByTime(1300);
      expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
