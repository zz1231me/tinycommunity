// client/src/components/common/ModalShell.test.tsx
// 모달의 접근성 계약.
//
// 이것들은 눈으로 봐서는 빠진 줄 모른다 — 실제로 ESC 가 안 되는 다이얼로그가
// 하나 섞여 있었고, 화면만 봐서는 다른 모달과 구별되지 않았다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModalShell } from './ModalShell';

function open(onClose = vi.fn()) {
  const view = render(
    <ModalShell label="테스트 대화상자" onClose={onClose}>
      <button type="button">첫 번째</button>
      <button type="button">두 번째</button>
    </ModalShell>
  );
  return { ...view, onClose };
}

describe('닫기', () => {
  it('ESC 로 닫힌다', () => {
    const { onClose } = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('포커스가 모달 밖에 있어도 ESC 가 먹는다', () => {
    // 문서 수준에서 듣지 않으면, 안쪽 입력칸을 벗어난 순간 ESC 가 죽는다
    const { onClose } = open();
    document.body.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('바깥 덮개를 누르면 닫힌다', () => {
    const { onClose, container } = open();
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('안쪽을 눌러도 닫히지 않는다', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('포커스', () => {
  it('열리면 안쪽 첫 요소로 간다', async () => {
    open();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByText('첫 번째')));
  });

  it('닫히면 열기 전 자리로 돌아간다', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = open();
    await vi.waitFor(() => expect(document.activeElement).not.toBe(trigger));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('마지막 요소에서 Tab 하면 첫 요소로 돌아온다', async () => {
    // 밖으로 새면 뒤에 가려진 화면을 조작하게 된다
    open();
    const last = screen.getByText('두 번째');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('첫 번째'));
  });

  it('첫 요소에서 Shift+Tab 하면 마지막으로 간다', async () => {
    open();
    screen.getByText('첫 번째').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('두 번째'));
  });
});

describe('스크린리더', () => {
  it('이름과 모달 표시를 붙인다', () => {
    open();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', '테스트 대화상자');
  });
});
