// 툴팁은 마우스만이 아니라 키보드 포커스로도 떠야 한다. title 속성을 버린 이유다.

import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from './Tooltip';

function setup() {
  render(
    <Tooltip content="상세 설명">
      <button type="button">대상</button>
    </Tooltip>
  );
}

describe('Tooltip', () => {
  it('처음에는 보이지 않는다', () => {
    setup();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('키보드로 포커스하면 뜨고 ESC 로 닫힌다', async () => {
    setup();
    // 감싼 요소가 아니라 안쪽 단추에 포커스가 온다. React 의 onFocus 가 올라와야 뜬다.
    await act(async () => screen.getByText('대상').focus());
    expect(screen.getByRole('tooltip')).toHaveTextContent('상세 설명');

    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
