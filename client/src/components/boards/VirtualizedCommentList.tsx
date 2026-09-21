// 댓글이 많을 때만 화면에 보이는 것만 그린다. 최상위 댓글 하나가 한 칸이다.

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/** 이 수를 넘을 때만 가상화한다. */
export const VIRTUALIZE_THRESHOLD = 50;

/** 한 칸의 초기 예상 높이(px). 실제 높이는 그린 뒤 측정해 보정한다. */
const ESTIMATED_ITEM_HEIGHT = 180;

/** 화면 밖에 미리 그려 두는 칸 수. */
const OVERSCAN = 5;

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
  /** 스크롤을 담당하는 요소. 없으면 window. */
  scrollElement: HTMLElement | null;
}

export function VirtualizedCommentList<T>({ items, keyOf, renderItem, scrollElement }: Props<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: OVERSCAN,
    // 댓글마다 길이가 달라 예상 높이로는 맞지 않는다. 그린 뒤 실제 높이로 보정한다.
    measureElement: el => el.getBoundingClientRect().height,
    // 목록이 문서 중간에 있어 그 시작 위치만큼 보정한다
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  // 정렬을 바꾸면 각 칸의 높이가 달라진다. 측정값을 버려 다시 재게 한다.
  useEffect(() => {
    virtualizer.measure();
  }, [items, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map(virtualItem => (
        <div
          key={keyOf(items[virtualItem.index])}
          data-index={virtualItem.index}
          ref={virtualizer.measureElement}
          className="absolute left-0 top-0 w-full"
          style={{
            transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {renderItem(items[virtualItem.index])}
        </div>
      ))}
    </div>
  );
}
