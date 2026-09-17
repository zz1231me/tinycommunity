// client/src/pages/memos/MemoEditor.test.tsx
//
// 메모 편집기의 포커스. 여기는 다른 대화상자와 사정이 다르다 — 안쪽 첫 요소가
// 색상 단추라, 포커스 가두기를 그냥 붙이면 글을 쓰러 연 사람이 색상 단추에서
// 시작하게 된다. 원래는 제목 칸이 autoFocus 였다.
//
// 그래서 여기서 고정하는 것은 '가둔다' 만이 아니라 '어디부터 시작하는가' 다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoEditor } from './MemoEditor';

const renderEditor = (onClose = vi.fn()) => {
  render(<MemoEditor memo={null} onSave={vi.fn()} onClose={onClose} />);
  return onClose;
};

const title = () => screen.getByPlaceholderText('제목 (선택사항)');
const btn = (name: string) => screen.getByRole('button', { name });

describe('메모 편집기의 포커스', () => {
  it('열면 제목 칸에서 시작한다', async () => {
    renderEditor();
    // 색상 단추가 안쪽 첫 요소지만, 글을 쓰러 온 사람의 자리는 제목 칸이다
    await waitFor(() => expect(document.activeElement).toBe(title()));
  });

  it('마지막에서 Tab 하면 안으로 돌아온다 — 밖으로 새지 않는다', async () => {
    renderEditor();
    // 훅의 첫 포커스가 끝나기를 기다리기만 한다 — 어디로 갔는지는 여기서 따지지 않는다.
    // 기다리지 않으면 아래에서 옮긴 포커스를 훅이 도로 가져간다. 그렇다고 '제목 칸' 이라고
    // 못 박으면 첫 포커스가 깨질 때 이 테스트까지 덩달아 깨져 무엇이 고장났는지 흐려진다.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));

    btn('저장').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // 가두지 않으면 뒤에 가려진 메모 판의 단추로 넘어간다
    expect(document.activeElement).toBe(btn('노랑'));
  });

  it('ESC 를 누르면 닫는다', () => {
    // ESC 는 포커스가 어디에 있든 동작한다 — 첫 포커스를 기다릴 이유가 없다
    const onClose = renderEditor();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('대화상자로 알린다', () => {
    // 가둬 놓고 aria-modal 이 없으면 화면 낭독기는 뒤쪽 내용을 계속 읽는다
    renderEditor();
    expect(screen.getByRole('dialog', { name: '새 메모' })).toBeInTheDocument();
  });
});
