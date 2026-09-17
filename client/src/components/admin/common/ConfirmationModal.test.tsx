// client/src/components/admin/common/ConfirmationModal.test.tsx
//
// 이 대화상자는 화면 열여섯 곳이 함께 쓴다 — 게시글·게시판·역할·태그·담당자 삭제가
// 모두 여기를 지난다. 그래서 포커스가 틀리면 열여섯 곳이 같이 틀린다.
//
// 포커스 처리를 손으로 갖고 있던 것을 공용 훅으로 옮겼다. 옮기기 전에는 이 사본에
// 테스트가 없었다. 여기서 거는 것은 넷이다:
//   1. 위험한 확인이니 취소에서 시작한다
//   2. ESC 는 취소 방향으로 닫는다
//   3. Tab 이 대화상자 밖으로 새지 않는다
//   4. 닫으면 열기 전에 보던 자리로 돌아온다

import { createElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmationModal } from './ConfirmationModal';

// 진입 애니메이션이 언마운트로 취소되면 잡히지 않는 AbortError 가 남아, 단언이 전부
// 통과해도 vitest 가 실행을 실패로 끝낸다(exit 1). 다른 테스트와 같은 방식으로 걷어 낸다.
// AnimatePresence 도 함께 돌려줘야 한다 — 이 파일이 그것으로 감싸여 있다.
vi.mock('framer-motion', () => {
  const strip = (tag: string) =>
    function Motion({
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...rest
    }: Record<string, unknown>) {
      return createElement(tag, rest);
    };
  const cache = new Map<string, ReturnType<typeof strip>>();
  return {
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) => {
          if (!cache.has(tag)) cache.set(tag, strip(tag));
          return cache.get(tag);
        },
      }
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
  };
});

const btn = (name: string) => screen.getByRole('button', { name });

const showOpen = (onCancel = vi.fn(), onConfirm = vi.fn()) => {
  render(
    <ConfirmationModal
      open
      title="정말 지울까요"
      message="되돌릴 수 없습니다."
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { onCancel, onConfirm };
};

/** 바깥 단추에 포커스를 둔 채 열었다가 닫는 화면 — 포커스 복원을 보려면 필요하다 */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        바깥
      </button>
      <ConfirmationModal
        open={open}
        title="정말 지울까요"
        onConfirm={() => {}}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe('확인 대화상자의 포커스', () => {
  it('열면 취소에서 시작한다 — 위험한 확인의 기본은 취소다', async () => {
    showOpen();
    // 확인(삭제)에 포커스가 얹힌 채 열리면 Enter 한 번에 지워진다
    await waitFor(() => expect(document.activeElement).toBe(btn('취소')));
  });

  it('마지막에서 Tab 하면 취소로 돌아온다', async () => {
    showOpen();
    await waitFor(() => expect(document.activeElement).toBe(btn('취소')));

    btn('확인').focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(btn('취소'));
  });

  it('ESC 를 누르면 취소를 부른다', () => {
    // ESC 는 포커스가 어디 있든 동작한다 — 첫 포커스를 기다릴 이유가 없다
    const { onCancel, onConfirm } = showOpen();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    // 위험한 쪽이 딸려 불리면 안 된다
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('닫으면 열기 전에 보던 자리로 돌아온다', async () => {
    render(<Harness />);
    const outside = btn('바깥');
    outside.focus();
    fireEvent.click(outside);

    await waitFor(() => expect(document.activeElement).toBe(btn('취소')));

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    // 되돌리지 않으면 포커스가 body 로 떨어져, 키보드 사용자는 처음부터 다시 Tab 해야 한다
    expect(document.activeElement).toBe(outside);
  });

  it('닫혀 있으면 ESC 를 가로채지 않는다 — 음성 대조', () => {
    // 닫힌 대화상자가 ESC 를 먹으면 뒤에 있는 화면의 ESC 가 동작하지 않는다.
    // 이 대화상자는 부모가 항상 그려 두고 open 으로만 여닫는다 — 열여섯 곳 전부.
    const onCancel = vi.fn();
    render(
      <ConfirmationModal
        open={false}
        title="정말 지울까요"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
