// client/src/components/attendance/blinkingTitle.test.tsx
// 퇴근 알림은 사람이 여는 것이 아니라 시계가 연다 — 글을 읽는 도중에도 시작된다.
// 그 사이 다른 화면으로 옮겨 가면 탭 제목의 주인이 바뀌는데, 처음 제목을 한 번만
// 기억해 두면 읽던 글의 제목이 계속 깜빡이고 알림을 닫은 뒤에도 그대로 남는다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { useBlinkingTitle } from './useBlinkingTitle';

function Blink({ active, message }: { active: boolean; message: string }) {
  useBlinkingTitle(active, message);
  return null;
}

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('알림이 뜬 동안의 탭 제목', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.title = '글 제목 | 사이트';
  });
  afterEach(() => {
    vi.useRealTimers();
    document.title = '';
  });

  it('번갈아 보여 주고, 닫으면 원래대로 돌려 놓는다', () => {
    const { unmount } = render(<Blink active message="퇴근 시간입니다" />);
    tick(1000);
    expect(document.title).toBe('퇴근 시간입니다');
    tick(1000);
    expect(document.title).toBe('글 제목 | 사이트');
    tick(1000);
    unmount();
    expect(document.title).toBe('글 제목 | 사이트');
  });

  it('깜빡이는 사이 다른 화면이 제목을 바꾸면 그쪽을 따른다', () => {
    const { unmount } = render(<Blink active message="퇴근 시간입니다" />);
    tick(1000); // 알림 문구가 보이는 중

    // 사용자가 다른 화면으로 옮겨 간다
    document.title = '다른 화면 | 사이트';

    tick(1000); // 원래 제목으로 돌아갈 차례
    tick(1000); // 다시 알림 문구
    tick(1000);
    expect(document.title).toBe('다른 화면 | 사이트');

    unmount();
    expect(document.title).toBe('다른 화면 | 사이트');
  });
});
