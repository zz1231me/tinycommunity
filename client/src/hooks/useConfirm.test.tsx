// 확인창은 답을 약속으로 돌려준다. 확인·취소·ESC 가 각각 맞는 값으로 풀려야
// 부른 쪽이 되돌리기 어려운 일을 하거나 멈춘다.

import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useConfirm, type ConfirmOptions } from './useConfirm';

function Harness({
  onAnswer,
  options,
}: {
  onAnswer: (ok: boolean) => void;
  options: ConfirmOptions;
}) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button type="button" onClick={() => confirm(options).then(onAnswer)}>
        묻기
      </button>
      {dialog}
    </>
  );
}

function setup(options: ConfirmOptions = { title: '지울까요?', confirmLabel: '지우기' }) {
  const answers: boolean[] = [];
  render(<Harness options={options} onAnswer={ok => answers.push(ok)} />);
  fireEvent.click(screen.getByText('묻기'));
  return answers;
}

describe('useConfirm', () => {
  it('묻기 전에는 아무것도 그리지 않는다', () => {
    render(<Harness options={{ title: '지울까요?' }} onAnswer={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('확인을 누르면 true 로 풀리고 닫힌다', async () => {
    const answers = setup();
    expect(screen.getByRole('dialog', { name: '지울까요?' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText('지우기')));
    expect(answers).toEqual([true]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('취소를 누르면 false', async () => {
    const answers = setup();
    await act(async () => fireEvent.click(screen.getByText('취소')));
    expect(answers).toEqual([false]);
  });

  it('ESC 도 취소다 — 아무 답 없이 닫히면 부른 쪽이 영영 기다린다', async () => {
    const answers = setup();
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(answers).toEqual([false]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('설명을 함께 보여 준다', () => {
    setup({ title: '완료로 옮길까요?', description: '기본 목록에서 빠집니다.' });
    expect(screen.getByText('기본 목록에서 빠집니다.')).toBeInTheDocument();
  });
});
