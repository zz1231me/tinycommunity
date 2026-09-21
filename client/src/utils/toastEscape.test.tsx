// client/src/utils/toastEscape.test.tsx
// 오류 팝업은 화면 정중앙에 딤 배경과 함께 무엇보다 위에 뜬다.
// 그런데 ESC 를 document 에서 그냥 듣기만 하면, 같은 한 번의 ESC 가 뒤에 열려 있던
// 대화상자의 닫기까지 불러 버린다 — 오류 메시지를 지웠을 뿐인데 화면이 사라진다.
// (세션 강제 종료가 실패하면 실제로 이 순서가 된다: 확인 상자는 닫히고,
//  활동 기록 대화상자는 열린 채로 남고, 그 위에 오류 팝업이 뜬다.)

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { toast } from './toast';

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  return (
    <div ref={ref}>
      <button type="button">대화상자 단추</button>
    </div>
  );
}

describe('오류 팝업의 ESC', () => {
  it('뒤에 열려 있는 대화상자까지 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);

    toast.error('세션 종료 중 오류가 발생했습니다.');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
