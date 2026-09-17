// 코드 하이라이팅이 본문 재렌더를 견디는지.
//
// 본문은 dangerouslySetInnerHTML 로 붙어서, 화면이 다시 그려지면 컨테이너의 자식이
// 통째로 새로 만들어진다. 칠해 둔 색이 버려진 뒤 다시 칠할 계기가 없으면
// 코드가 맨 글자로 남는다 — 글·댓글·위키·일정·미리보기가 모두 그랬다.

import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { useCodeHighlight } from './useCodeHighlight';

// happy-dom 에서 실제 하이라이터를 돌릴 필요는 없다. 여기서 볼 것은
// "다시 그려진 뒤에도 다시 칠하러 오는가" 하나다.
const highlightElement = vi.hoisted(() =>
  vi.fn((el: HTMLElement) => el.setAttribute('data-highlighted', 'yes'))
);
vi.mock('highlight.js/lib/common', () => ({ default: { highlightElement } }));

const CODE = '<pre><code class="language-js">const a = 1;</code></pre>';

function Harness({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useCodeHighlight(ref);
  return <div ref={ref} data-testid="body" dangerouslySetInnerHTML={{ __html: html }} />;
}

describe('useCodeHighlight', () => {
  it('처음 그려질 때 칠한다', () => {
    const { getByTestId } = render(<Harness html={CODE} />);
    expect(getByTestId('body').querySelector('code')?.dataset.highlighted).toBe('yes');
  });

  it('본문이 다시 그려져도 다시 칠한다', async () => {
    const { getByTestId } = render(<Harness html={CODE} />);
    const body = getByTestId('body');
    expect(body.querySelector('code')?.dataset.highlighted).toBe('yes');

    // React 가 본문을 새로 붙이는 것과 같은 일
    body.innerHTML = CODE;
    expect(body.querySelector('code')?.dataset.highlighted).toBeUndefined();

    await waitFor(() => {
      expect(body.querySelector('code')?.dataset.highlighted).toBe('yes');
    });
  });

  it('이미 칠한 블록은 다시 칠하지 않는다', async () => {
    highlightElement.mockClear();
    const { getByTestId } = render(<Harness html={CODE} />);
    const body = getByTestId('body');
    // 컨테이너 자식이 바뀌지 않는 변화는 다시 칠할 이유가 없다
    body.setAttribute('data-x', '1');
    await new Promise(r => setTimeout(r, 30));
    expect(highlightElement).toHaveBeenCalledTimes(1);
  });
});
