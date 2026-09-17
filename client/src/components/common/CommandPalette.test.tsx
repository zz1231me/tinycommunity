// client/src/components/common/CommandPalette.test.tsx
//
// 명령어 팔레트의 포커스.
//
// cmdk 는 입력칸에 포커스를 주고 ↑↓·Enter 를 맡지만 Tab 은 아무도 잡지 않았다.
// 그래서 팔레트를 열어 둔 채 Tab 을 누르면 포커스가 뒤쪽 화면으로 새어 나가, 가려진
// 곳의 단추에 포커스가 얹혔다. 그걸 막은 것이 이 커밋이고, 여기서 그것을 고정한다.
//
// ESC 도 훅 하나로 모았다. 예전에는 cmdk 요소의 onKeyDown 에 달려 있어 포커스가
// 팔레트 안에 있을 때만 들었다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../store/auth', () => ({
  useAuthStore: () => ({ user: { id: 'testuser', role: 'user' } }),
}));

vi.mock('../../hooks/useAccessibleBoards', () => ({
  useAccessibleBoards: () => ({ boards: [{ id: 'notice', name: '공지사항' }] }),
}));

const input = () => screen.getByPlaceholderText('명령어 또는 페이지 검색...');

/** 문서에 진짜 Tab 키 이벤트를 흘려보내고, 가두기가 그것을 막았는지 본다 */
function pressTab(): boolean {
  const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  return ev.defaultPrevented;
}

describe('명령어 팔레트의 포커스', () => {
  it('열면 입력칸에서 시작한다', async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />);
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it('Tab 이 팔레트 밖으로 새지 않는다', async () => {
    render(<CommandPalette open onOpenChange={vi.fn()} />);
    await waitFor(() => expect(document.activeElement).toBe(input()));

    // 이 팔레트에서 포커스를 받는 것은 입력칸 하나뿐이라 처음이자 마지막이다.
    // 그래서 '포커스가 그대로인지' 로는 아무것도 알 수 없다 — 가두지 않아도 그대로다.
    // 대신 훅이 Tab 을 실제로 가로챘는지(preventDefault)를 본다. 가두지 않으면
    // 아무도 막지 않아 브라우저가 뒤쪽 화면으로 포커스를 옮긴다.
    expect(pressTab()).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('ESC 를 누르면 닫는다', () => {
    // ESC 는 포커스가 어디 있든 동작한다 — 첫 포커스를 기다릴 이유가 없다.
    // 기다리면 첫 포커스가 깨질 때 이 테스트까지 덩달아 깨져, 무엇이 고장났는지 흐려진다.
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('닫혀 있으면 ESC 를 가로채지 않는다 — 음성 대조', () => {
    // 닫힌 팔레트가 ESC 를 먹으면 뒤에 있는 화면의 ESC 가 동작하지 않는다
    const onOpenChange = vi.fn();
    render(<CommandPalette open={false} onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('대화상자로 알린다', () => {
    // 가둬 놓고 aria-modal 이 없으면 화면 낭독기는 뒤쪽 내용을 계속 읽는다
    render(<CommandPalette open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: '명령어 팔레트' })).toBeInTheDocument();
  });
});
