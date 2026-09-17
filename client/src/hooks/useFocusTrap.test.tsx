// client/src/hooks/useFocusTrap.test.tsx
//
// 이 훅은 화면 여러 곳의 대화상자가 함께 쓴다. 여기서 한 번 틀리면 모든 대화상자가
// 같이 틀린다. 그래서 '동작하는 것처럼 보이는' 것이 아니라 실제로 무엇을 막는지를 건다:
// Tab 이 밖으로 새지 않는가, 닫을 때 포커스가 제자리로 오는가, ESC 가 닫는가.

import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

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
