// client/src/hooks/useFocusTrap.test.tsx
//
// 이 훅은 화면 여러 곳의 대화상자가 함께 쓴다. 여기서 한 번 틀리면 모든 대화상자가
// 같이 틀린다. 그래서 '동작하는 것처럼 보이는' 것이 아니라 실제로 무엇을 막는지를 건다:
// Tab 이 밖으로 새지 않는가, 닫을 때 포커스가 제자리로 오는가, ESC 가 닫는가.

import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';
import { resetScrollLock } from '../utils/scrollLock';

function Dialog({ onClose, active = true }: { onClose: () => void; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose, active);
  return (
    <div ref={ref}>
      <button type="button">처음</button>
      <button type="button">가운데</button>
      <button type="button">마지막</button>
    </div>
  );
}

/**
 * 대화상자 바깥에 버튼이 하나 있는 화면.
 *
 * 닫힌 채로 시작한다. 훅은 '열리는 순간의 포커스' 를 기억했다가 되돌리므로,
 * 열기 전에 바깥 버튼이 먼저 포커스를 갖고 있어야 되돌리기를 제대로 확인할 수 있다.
 */
function Harness({ active = true }: { active?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        바깥
      </button>
      {open && <Dialog onClose={() => setOpen(false)} active={active} />}
    </>
  );
}

const btn = (name: string) => screen.getByRole('button', { name });

/** 바깥 버튼에 포커스를 둔 채로 대화상자를 연다 */
function openFromOutside() {
  const outside = btn('바깥');
  outside.focus();
  fireEvent.click(outside);
  return outside;
}

describe('포커스를 가둔다', () => {
  it('마지막에서 Tab 하면 처음으로 돌아온다 — 밖으로 새지 않는다', () => {
    render(<Harness />);
    openFromOutside();
    btn('마지막').focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(btn('처음'));
  });

  it('처음에서 Shift+Tab 하면 마지막으로 간다', () => {
    render(<Harness />);
    openFromOutside();
    btn('처음').focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(btn('마지막'));
  });

  it('가운데에서는 브라우저가 알아서 하게 둔다', () => {
    render(<Harness />);
    openFromOutside();
    btn('가운데').focus();

    // 가로채면 대화상자 안의 평범한 Tab 이동까지 망가진다
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(btn('가운데'));
  });
});

describe('ESC 로 닫는다', () => {
  it('ESC 를 누르면 닫기를 부른다', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('꺼져 있으면 ESC 를 가로채지 않는다', () => {
    // 닫힌 대화상자가 ESC 를 먹으면 뒤에 있는 화면의 ESC 가 동작하지 않는다
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} active={false} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('꺼져 있으면 Tab 도 가두지 않는다', () => {
    render(<Harness active={false} />);
    openFromOutside();
    btn('마지막').focus();

    fireEvent.keyDown(document, { key: 'Tab' });
    // 가두지 않으므로 훅이 포커스를 옮기지 않는다
    expect(document.activeElement).toBe(btn('마지막'));
  });
});

/** 단추가 먼저 오고 쓸 칸이 뒤에 있는 대화상자 — 메모 편집기와 같은 모양 */
function InputDialog({ withInitial }: { withInitial: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useFocusTrap(ref, () => {}, true, withInitial ? inputRef : undefined);
  return (
    <div ref={ref}>
      <button type="button">단추</button>
      <input ref={inputRef} aria-label="제목" />
    </div>
  );
}

describe('열었을 때 첫 포커스', () => {
  it('지정한 곳이 있으면 그리로 간다', async () => {
    render(<InputDialog withInitial />);
    // 지정하지 않으면 단추가 먼저라 글 쓰러 연 사람이 단추에서 시작하게 된다
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('제목')));
  });

  it('지정하지 않으면 안쪽 첫 요소로 간다 — 기존 동작', async () => {
    render(<InputDialog withInitial={false} />);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '단추' }))
    );
  });
});

/**
 * 대화상자 둘이 함께 떠 있고 그중 하나만 켜진 화면.
 *
 * 위키 화면은 확인 대화상자 셋(삭제·복원·이탈)이 한곳에 있고, 겹칠 때를 대비해 ESC 를
 * delete → restore → nav 순서로 한 곳에서 처리해 왔다. 가두기는 대화상자마다 따로
 * 걸어야 해서 그 순서를 active 로 옮겼는데, 그러면 '꺼진 쪽은 조용하다' 가 그 순서를
 * 지탱하는 전제가 된다.
 */
function TwoDialogs({
  onCloseTop,
  onCloseBottom,
  topActive,
}: {
  onCloseTop: () => void;
  onCloseBottom: () => void;
  topActive: boolean;
}) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  useFocusTrap(topRef, onCloseTop, topActive);
  useFocusTrap(bottomRef, onCloseBottom, !topActive);
  return (
    <>
      <div ref={bottomRef}>
        <button type="button">아래</button>
      </div>
      <div ref={topRef}>
        <button type="button">위</button>
      </div>
    </>
  );
}

describe('대화상자가 겹칠 때', () => {
  it('켜진 쪽만 ESC 를 받는다', () => {
    // 둘 다 받으면 ESC 한 번에 여럿이 닫힌다 — 위에 뜬 것만 닫으려던 사람이
    // 뒤에 있던 것까지 잃는다
    const top = vi.fn();
    const bottom = vi.fn();
    render(<TwoDialogs onCloseTop={top} onCloseBottom={bottom} topActive />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(top).toHaveBeenCalledTimes(1);
    expect(bottom).not.toHaveBeenCalled();
  });

  it('켜진 쪽이 바뀌면 받는 쪽도 바뀐다', () => {
    const top = vi.fn();
    const bottom = vi.fn();
    render(<TwoDialogs onCloseTop={top} onCloseBottom={bottom} topActive={false} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(bottom).toHaveBeenCalledTimes(1);
    expect(top).not.toHaveBeenCalled();
  });
});

describe('닫을 때 포커스를 되돌린다', () => {
  it('열기 전에 보던 자리로 돌아온다', () => {
    render(<Harness />);
    const outside = openFromOutside();
    expect(btn('처음')).toBeInTheDocument();

    // 안쪽으로 포커스를 옮겨 둔 뒤 닫는다
    btn('처음').focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: '처음' })).not.toBeInTheDocument();
    // 되돌리지 않으면 포커스가 body 로 떨어져, 키보드 사용자는 처음부터 다시 Tab 해야 한다
    expect(document.activeElement).toBe(outside);
  });
});

describe('열려 있는 동안 배경 스크롤을 잠근다', () => {
  it('열면 잠기고 닫으면 풀린다', () => {
    resetScrollLock();
    render(<Harness />);
    // 뒤 화면이 같이 스크롤되면 대화상자가 시야 밖으로 밀려난다
    expect(document.body.style.overflow).toBe('');

    openFromOutside();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });

  it('겹쳐 열린 대화상자 중 하나만 닫혀도 잠금이 남는다', () => {
    resetScrollLock();
    const { unmount } = render(<Dialog onClose={() => {}} />);
    render(<Dialog onClose={() => {}} />); // 그 위에 열린 확인 상자
    expect(document.body.style.overflow).toBe('hidden');

    unmount(); // 하나만 닫힘
    expect(document.body.style.overflow).toBe('hidden');
  });
});

describe('겹쳐 열린 대화상자', () => {
  /** 바깥 대화상자 위에 확인 상자가 하나 더 열린 화면 */
  function Nested({
    onOuterClose,
    onInnerClose,
  }: {
    onOuterClose: () => void;
    onInnerClose: () => void;
  }) {
    const outer = useRef<HTMLDivElement>(null);
    const inner = useRef<HTMLDivElement>(null);
    useFocusTrap(outer, onOuterClose);
    useFocusTrap(inner, onInnerClose);
    // 확인 상자는 portal 을 쓰지 않는다 — 바깥 상자의 DOM 안에 그려지므로
    // 바깥 훅의 요소 목록에도 안쪽 단추가 들어간다
    return (
      <div ref={outer}>
        <button type="button">바깥 단추</button>
        <div ref={inner}>
          <button type="button">안쪽 취소</button>
          <button type="button">안쪽 확인</button>
        </div>
      </div>
    );
  }

  it('ESC 는 맨 위 상자만 닫는다', () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(<Nested onOuterClose={onOuterClose} onInnerClose={onInnerClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    // 확인만 취소하려던 것이 화면째 닫히면 안 된다
    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
  });

  it('Tab 은 맨 위 상자 안에서만 돈다', () => {
    render(<Nested onOuterClose={() => {}} onInnerClose={() => {}} />);
    btn('안쪽 확인').focus(); // 안쪽의 마지막 요소 = 바깥 목록의 마지막이기도 하다

    fireEvent.keyDown(document, { key: 'Tab' });

    // 바깥 훅까지 반응하면 포커스가 가려진 '바깥 단추' 로 튄다
    expect(document.activeElement).toBe(btn('안쪽 취소'));
  });
});

describe('나중에 열렸지만 아래에 깔린 대화상자', () => {
  /**
   * 퇴근 알림은 사람이 여는 것이 아니라 시계가 연다. App 맨 위에 있어 화면에서는
   * 나중에 그려지는 페이지 대화상자에 가린다 — 그런데 '나중에 열렸다' 는 이유로
   * 맨 위 취급을 받으면, 보이는 쪽에서 ESC 가 듣지 않는다.
   */
  function TimedReminder({
    onReminderClose,
    onDialogClose,
  }: {
    onReminderClose: () => void;
    onDialogClose: () => void;
  }) {
    const [reminderOpen, setReminderOpen] = useState(false);
    const reminder = useRef<HTMLDivElement>(null);
    const dialog = useRef<HTMLDivElement>(null);
    useFocusTrap(reminder, onReminderClose, reminderOpen);
    useFocusTrap(dialog, onDialogClose, true);
    return (
      <>
        {/* App 맨 위 — 먼저 그려지므로 아래에 깔린다 */}
        {reminderOpen && (
          <div ref={reminder}>
            <button type="button">알림 닫기</button>
          </div>
        )}
        {/* 페이지 대화상자 — 나중에 그려져 위에 온다 */}
        <div ref={dialog}>
          <button type="button">대화상자 단추</button>
        </div>
        <button type="button" onClick={() => setReminderOpen(true)}>
          시계가 연다
        </button>
      </>
    );
  }

  it('가려진 알림이 ESC 를 가로채지 않는다', () => {
    const onReminderClose = vi.fn();
    const onDialogClose = vi.fn();
    render(<TimedReminder onReminderClose={onReminderClose} onDialogClose={onDialogClose} />);

    fireEvent.click(btn('시계가 연다')); // 대화상자가 열려 있는 사이에 알림이 뜬다
    expect(btn('알림 닫기')).toBeInTheDocument(); // 알림이 실제로 떴는지 먼저 확인한다
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onDialogClose).toHaveBeenCalledTimes(1);
    expect(onReminderClose).not.toHaveBeenCalled();
  });
});
