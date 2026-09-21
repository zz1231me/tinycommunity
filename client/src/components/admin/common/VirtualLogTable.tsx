import { ReactNode, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface LogColumn {
  /** 헤더 라벨 */
  label: string;
  /** colgroup 폭. 생략하면 남는 공간을 차지한다 */
  width?: string;
}

interface Props<T> {
  columns: LogColumn[];
  rows: T[];
  /** 행 하나의 <td> 들을 반환한다 (<tr> 은 이 컴포넌트가 감싼다) */
  renderRow: (row: T, index: number) => ReactNode;
  /** 펼쳐진 상세 행. 같은 tbody 안 두 번째 <tr> 로 들어간다. 닫힌 행은 null. */
  renderExpandedRow?: (row: T, index: number) => ReactNode | null;
  /** 행 높이 추정치. 가상 스크롤 계산에 쓴다. */
  estimateRowHeight?: number;
  emptyMessage: string;
  /** 조회 실패. 있으면 emptyMessage 대신 실패했다고 알린다. */
  error?: unknown;
  loading: boolean;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  /** 확장 행 등으로 행 높이가 가변이면 true (measureElement 로 실측) */
  dynamicRowHeight?: boolean;
  height?: number;
}

/** 관리자 로그가 공유하는 가상 스크롤 테이블. 헤더와 행은 같은 colgroup 으로 폭을 맞춘다. */
export function VirtualLogTable<T>({
  columns,
  rows,
  renderRow,
  renderExpandedRow,
  estimateRowHeight = 56,
  emptyMessage,
  error,
  loading,
  page,
  totalPages,
  onPrev,
  onNext,
  dynamicRowHeight = false,
  height = 500,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 헤더는 본문과 다른 스크롤 상자라 가로 스크롤을 따로 맞춰 줘야 한다.
  const headerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 10,
  });

  const colgroup = (
    <colgroup>
      {columns.map((col, i) => (
        <col key={i} style={col.width ? { width: col.width } : undefined} />
      ))}
    </colgroup>
  );

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div ref={headerRef} className="overflow-x-hidden">
        <table className="w-full table-fixed divide-y divide-slate-200 dark:divide-slate-700">
          {colgroup}
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="admin-th">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      <div
        ref={scrollRef}
        onScroll={e => {
          const header = headerRef.current;
          if (header) header.scrollLeft = e.currentTarget.scrollLeft;
        }}
        style={{ height: `${height}px`, overflowY: 'auto', overflowX: 'auto' }}
      >
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              ref={dynamicRowHeight ? rowVirtualizer.measureElement : undefined}
              data-index={virtualRow.index}
            >
              <table className="w-full table-fixed">
                {colgroup}
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    {renderRow(rows[virtualRow.index], virtualRow.index)}
                  </tr>
                  {renderExpandedRow?.(rows[virtualRow.index], virtualRow.index)}
                </tbody>
              </table>
            </div>
          ))}
          {rows.length === 0 && !loading && (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              {error ? '불러오지 못했습니다. 잠시 후 다시 시도해주세요.' : emptyMessage}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={onPrev}
          disabled={page === 1}
          className="px-3 py-1 rounded border border-slate-200 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
        >
          이전
        </button>
        <span className="text-sm text-slate-700 dark:text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={page >= totalPages}
          className="px-3 py-1 rounded border border-slate-200 dark:border-slate-600 text-sm disabled:opacity-50 dark:text-slate-300"
        >
          다음
        </button>
      </div>
    </div>
  );
}
