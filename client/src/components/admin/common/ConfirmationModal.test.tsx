// client/src/components/admin/common/ConfirmationModal.test.tsx
//
// 지우는 확인은 한 번만 나가는가.
//
// 이 상자는 17곳이 함께 쓴다(글·게시판·역할·태그·북마크·사용자·일정·메모…). 확인 단추에
// 진행 중 표시가 없어, 응답이 오기 전에 한 번 더 누르면 같은 삭제 요청이 두 번 나갔다.

import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmationModal } from './ConfirmationModal';

// framer-motion 은 happy-dom 에서 잡히지 않는 AbortError 를 남긴다(다른 테스트와 같은 처리)
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      variants: _v,
      ...rest
    }: Record<string, unknown>) {
      return createElement(tag, rest);
    };
  const cache = new Map<string, ReturnType<typeof strip>>();
  return {
    motion: new Proxy(
      {},
      { get: (_t, tag: string) => cache.get(tag) ?? (cache.set(tag, strip(tag)), cache.get(tag)) }
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
  };
});

const show = (onConfirm: () => unknown) =>
  render(
    <ConfirmationModal
      open
      title="정말 지울까요?"
      confirmLabel="삭제"
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />
  );

describe('확인 단추', () => {
  it('처리가 끝나기 전에는 두 번 눌러도 한 번만 나간다', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>(r => (resolve = r)));
    show(onConfirm);
    const button = screen.getByRole('button', { name: '삭제' });

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => {
      resolve();
    });
    expect(button).not.toBeDisabled();
  });

  it('금방 끝나는 처리는 다시 누를 수 있다 — 대조', async () => {
    const onConfirm = vi.fn();
    show(onConfirm);
    const button = screen.getByRole('button', { name: '삭제' });

    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
