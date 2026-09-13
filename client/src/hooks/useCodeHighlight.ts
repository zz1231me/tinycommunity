// client/src/hooks/useCodeHighlight.ts
// 본문 안의 코드 블록에 색을 입힌다.
//
// 본문은 dangerouslySetInnerHTML 로 붙는다. 화면이 다시 그려지면 컨테이너의 자식이
// 통째로 새로 만들어지고, 여기서 칠해 둔 색은 그대로 버려진다. 마지막 재렌더 뒤에는
// 다시 칠할 계기가 없어 코드가 맨 글자로 남는다.
// 그래서 컨테이너의 자식이 바뀌는지 지켜보다가 바뀌면 다시 칠한다.
//
// hljs 는 <code> 안쪽만 건드린다. 여기서는 컨테이너의 직계 자식만 보므로(subtree 아님)
// 스스로를 다시 부르지 않는다.
//
// 글·댓글·위키·일정·미리보기가 같은 일을 각자 적어 두고 있었다. 한곳에 모아 두면
// 한 곳만 고쳐도 다섯 화면이 함께 고쳐진다.

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
