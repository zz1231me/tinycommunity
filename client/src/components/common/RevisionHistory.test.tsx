// 이력 화면의 고르기·비교 규칙을 고정한다.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RevisionHistory, type RevisionEntry } from './RevisionHistory';

// diff 렌더링 자체는 여기서 볼 것이 아니다 — 어떤 두 판을 비교하는지만 확인한다
vi.mock('./ContentDiffViewer', () => ({
  ContentDiffViewer: ({ contentA, contentB }: { contentA: string; contentB: string }) => (
    <div data-testid="diff">{`${contentA}|${contentB}`}</div>
  ),
}));

const rev = (id: number, content: string, title = `제목${id}`): RevisionEntry => ({
  id,
  title,
  content,
  createdAt: `2026-03-0${id}T09:00:00.000Z`,
  editor: { name: '편집자' },
});

// 최신순
const revisions = [rev(3, 'C'), rev(2, 'B'), rev(1, 'A')];

describe('수정 이력', () => {
  it('목록 줄은 버튼이라 키보드로 고를 수 있다', () => {
    render(<RevisionHistory revisions={revisions} currentContent="C" />);
    const rows = screen.getAllByRole('button', { pressed: false });
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('고르면 그 편집에서 바뀐 것(직전 ↔ 이 편집)을 먼저 보여준다', () => {
    render(<RevisionHistory revisions={revisions} currentContent="C" />);
    fireEvent.click(screen.getByText('제목2'));
    // 2번 판의 직전은 1번(A) — A|B 가 되어야 한다
    expect(screen.getByTestId('diff')).toHaveTextContent('A|B');
  });

  it('현재와 비교로 바꾸면 선택한 판 ↔ 현재를 보여준다', () => {
    render(<RevisionHistory revisions={revisions} currentContent="현재본문" />);
    fireEvent.click(screen.getByText('제목2'));
    fireEvent.click(screen.getByRole('button', { name: '현재와 비교' }));
    expect(screen.getByTestId('diff')).toHaveTextContent('B|현재본문');
  });

  it('가장 오래된 판은 직전이 없어 현재와 비교로 넘어간다', () => {
    render(<RevisionHistory revisions={revisions} currentContent="현재본문" />);
    fireEvent.click(screen.getByText('제목1'));
    expect(screen.getByRole('button', { name: '이 편집에서 바뀐 것' })).toBeDisabled();
    expect(screen.getByTestId('diff')).toHaveTextContent('A|현재본문');
    expect(screen.getByText('최초 작성이라 직전 판이 없습니다')).toBeInTheDocument();
  });

  it('목록과 비교를 함께 보여준다 — 하나를 보려고 다른 하나를 닫지 않는다', () => {
    render(<RevisionHistory revisions={revisions} currentContent="C" />);
    fireEvent.click(screen.getByText('제목2'));
    expect(screen.getByTestId('diff')).toBeInTheDocument();
    expect(screen.getByText('제목3')).toBeInTheDocument();
    expect(screen.getByText('제목1')).toBeInTheDocument();
  });

  it('다시 누르면 선택이 풀린다', () => {
    render(<RevisionHistory revisions={revisions} currentContent="C" />);
    fireEvent.click(screen.getByText('제목2'));
    fireEvent.click(screen.getByText('제목2'));
    expect(screen.queryByTestId('diff')).not.toBeInTheDocument();
  });

  it('복원을 주면 고른 판의 본문으로 되돌린다', () => {
    const onRestore = vi.fn();
    render(<RevisionHistory revisions={revisions} currentContent="C" onRestore={onRestore} />);
    fireEvent.click(screen.getByText('제목2'));
    fireEvent.click(screen.getByRole('button', { name: /이 판으로 복원/ }));
    expect(onRestore).toHaveBeenCalledWith('B');
  });

  it('이력이 없으면 그렇게 말한다', () => {
    render(<RevisionHistory revisions={[]} currentContent="C" />);
    expect(screen.getByText('아직 수정된 적이 없습니다.')).toBeInTheDocument();
  });

  it('실패하면 재시도를 준다', () => {
    const onRetry = vi.fn();
    render(
      <RevisionHistory
        revisions={[]}
        currentContent="C"
        error="불러오지 못했습니다."
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '재시도' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
