// client/src/components/ImageViewer.test.tsx
// 사진 크게 보기는 화면 전체를 덮는 대화상자다. 그런데 그렇게 알리지도, 포커스를
// 가두지도 않았다 — 눈으로 보면 사진만 떠 있으니 멀쩡해 보인다.
//
// 가두지 않으면 Tab 이 뒤 화면으로 새어, 가려진 목록의 링크가 눌린다: 사진은 그대로
// 떠 있는데 뒤에서 화면이 바뀐다. 낭독기 쪽은 더 나쁘다 — 뒤 화면을 계속 읽는다.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import ImageViewer from './ImageViewer';
import { resetScrollLock } from '../utils/scrollLock';

const open = (onClose = vi.fn()) => {
  resetScrollLock();
  const utils = render(
    <>
      <a href="/behind">뒤 화면 링크</a>
      <ImageViewer isOpen onClose={onClose} imageUrl="/x.png" altText="첨부 사진" />
    </>
  );
  return { ...utils, onClose };
};

describe('사진 크게 보기', () => {
  it('대화상자로 알리고 이름을 갖는다', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: '첨부 사진 크게 보기' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('ESC 로 닫힌다', () => {
    const { onClose } = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab 이 뒤 화면 링크로 새지 않는다', () => {
    open();
    const last = screen.getByRole('button', { name: '닫기' });
    last.focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(document.activeElement).not.toBe(screen.getByRole('link', { name: '뒤 화면 링크' }));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('열려 있는 동안 뒤 화면이 스크롤되지 않는다', () => {
    open();
    expect(document.body.style.overflow).toBe('hidden');
  });
});

describe('위에 다른 대화상자가 열렸을 때', () => {
  /** 사진 뷰어 위에 확인 상자가 하나 더 열린 화면 */
  function ViewerUnderDialog() {
    const above = useRef<HTMLDivElement>(null);
    useFocusTrap(above, () => {});
    return (
      <>
        <ImageViewer isOpen onClose={vi.fn()} imageUrl="/x.png" altText="첨부 사진" />
        <div ref={above}>
          <button type="button">위 상자 단추</button>
        </div>
      </>
    );
  }

  it('가려진 사진이 뒤에서 확대되지 않는다', () => {
    resetScrollLock();
    render(<ViewerUnderDialog />);
    const zoomLabel = () => screen.getByText(/%$/).textContent;
    const before = zoomLabel();

    fireEvent.keyDown(document, { key: '+' });

    expect(zoomLabel()).toBe(before);
  });
});
