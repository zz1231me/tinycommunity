// 본문 안의 코드 블록에 색을 입힌다.
// 본문은 dangerouslySetInnerHTML 로 붙으므로 자식 교체를 감시해 다시 칠한다.
// subtree 를 보지 않아야 hljs 의 변경이 자기 자신을 다시 부르지 않는다.

import { useEffect, type RefObject } from 'react';
import hljs from 'highlight.js/lib/common';

export function useCodeHighlight(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const paint = () => {
      container.querySelectorAll<HTMLElement>('pre code').forEach(block => {
        if (!block.dataset.highlighted) hljs.highlightElement(block);
      });
    };

    paint();
    const observer = new MutationObserver(paint);
    observer.observe(container, { childList: true });
    return () => observer.disconnect();
  }, [containerRef]);
}
