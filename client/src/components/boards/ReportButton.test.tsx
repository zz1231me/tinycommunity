// client/src/components/boards/ReportButton.test.tsx
//
// 이 대화상자는 원래 포커스 처리를 손으로 갖고 있었다 — 첫 포커스를 닫기 단추로,
// 닫힐 때 트리거로 되돌리기. 그것을 공용 훅으로 바꿨다.
//
// 바꾼 쪽이 '같은 일을 한다' 는 주장은 검증하지 않으면 그냥 주장이다. 특히 되돌리기는
// 방식이 다르다: 예전에는 트리거를 ref 로 붙들어 뒀고, 지금은 훅이 '열리기 직전에
// 포커스가 있던 곳' 으로 되돌린다. 트리거를 눌러야 열리니 결과가 같아야 하는데,
// 같은지를 여기서 고정한다. 덤으로 예전에 없던 Tab 가두기도 함께 본다.

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportButton } from './ReportButton';

const trigger = () => screen.getByRole('button', { name: '신고하기' });
const btn = (name: string) => screen.getByRole('button', { name });

/** 트리거에 포커스를 둔 채로 연다 — 실제 사용자가 누르는 방식 */
function openFromTrigger() {
  const t = trigger();
  t.focus();
  fireEvent.click(t);
  return t;
}

describe('신고 대화상자의 포커스', () => {
  it('열면 닫기 단추로 포커스가 간다', async () => {
    render(<ReportButton targetType="post" targetId={1} />);
    openFromTrigger();

    await waitFor(() => expect(document.activeElement).toBe(btn('닫기')));
  });

  it('닫으면 신고 단추로 포커스가 돌아온다', async () => {
    // 되돌리지 않으면 포커스가 body 로 떨어져, 키보드 사용자는 글 처음부터 다시 Tab 해야 한다
    render(<ReportButton targetType="post" targetId={1} />);
    const t = openFromTrigger();
    await waitFor(() => expect(document.activeElement).toBe(btn('닫기')));

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(t);
  });

  it('마지막에서 Tab 하면 안으로 돌아온다 — 손으로 만든 예전 버전에는 없던 것', async () => {
    render(<ReportButton targetType="post" targetId={1} />);
    openFromTrigger();
    await waitFor(() => expect(document.activeElement).toBe(btn('닫기')));

    btn('신고 제출').focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).toBe(btn('닫기'));
  });

  it('ESC 를 누르면 닫힌다', async () => {
    render(<ReportButton targetType="post" targetId={1} />);
    openFromTrigger();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
