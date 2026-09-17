// client/src/components/common/RevisionHistory.tsx
// 수정 이력 — 게시글과 위키가 같은 화면을 쓴다.
//
// 예전에는 둘이 따로 구현돼 있었다. 한쪽은 목록 줄이 button 이고 다른 쪽은 클릭되는
// div(키보드로 못 고름), 한쪽은 목록과 차이를 함께 보여주는데 다른 쪽은 둘을 오가는
// 토글, 로딩 표시도 제각각이었다. 같은 일을 하는 화면이 두 벌이면 한쪽만 고쳐진다.
//
// 비교 기준도 하나 늘렸다. 이력을 볼 때 가장 먼저 궁금한 것은 "이 편집에서 무엇이
// 바뀌었나" 인데, 예전에는 '선택한 판 ↔ 현재' 만 볼 수 있어 중간에 여러 번 고쳐진
// 문서에서는 그 편집이 무엇을 했는지 알 수 없었다.

import { useEffect, useMemo, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { ContentDiffViewer } from './ContentDiffViewer';
import { LoadingSpinner } from './LoadingStates';
import { ListState } from './ListState';
import { formatDateTime } from '../../utils/date';

export interface RevisionEntry {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  editor?: { name: string } | null;
  editorId?: string | null;
}

/** 무엇과 비교할지 */
type DiffMode = 'prev' | 'current';

interface Props {
  /** 최신순으로 정렬된 이력 */
  revisions: RevisionEntry[];
  /** 지금 문서의 본문 — '현재와 비교' 의 기준 */
  currentContent: string;
  heading?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** 주면 선택한 판을 되돌리는 버튼이 생긴다 */
  onRestore?: (content: string) => void;
  /** 주면 머리글에 닫기 버튼이 생긴다 */
  onClose?: () => void;
}

const nameOf = (r: RevisionEntry) => r.editor?.name ?? r.editorId ?? '알 수 없음';

export function RevisionHistory({
  revisions,
  currentContent,
  heading = '수정 이력',
  loading = false,
  error = null,
  onRetry,
  onRestore,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<DiffMode>('prev');

  const index = revisions.findIndex(r => r.id === selectedId);
  const selected = index === -1 ? null : revisions[index];
  // 목록이 최신순이므로 바로 다음 칸이 '그 편집 직전' 이다
  const previous = index === -1 ? null : (revisions[index + 1] ?? null);

  // 목록이 바뀌었는데 고른 판이 사라졌으면 선택을 푼다 (복원·편집 후 재조회)
  useEffect(() => {
    if (selectedId !== null && !revisions.some(r => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [revisions, selectedId]);

  // 가장 오래된 판은 직전이 없다 — 그때는 현재와 비교로 넘긴다
  const effectiveMode: DiffMode = mode === 'prev' && !previous ? 'current' : mode;

  const pair = useMemo(() => {
    if (!selected) return null;
    if (effectiveMode === 'prev' && previous) {
      return {
        a: previous.content,
        b: selected.content,
        labelA: `이전 (${formatDateTime(previous.createdAt)})`,
        labelB: `이 편집 (${formatDateTime(selected.createdAt)})`,
      };
    }
    return {
      a: selected.content,
      b: currentContent,
      labelA: `${formatDateTime(selected.createdAt)} (${nameOf(selected)})`,
      labelB: '현재',
    };
  }, [selected, previous, effectiveMode, currentContent]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <History className="h-4 w-4" aria-hidden="true" />
          {heading}
          {revisions.length > 0 && (
            <span className="text-xs font-normal text-slate-400">{revisions.length}개 판</span>
          )}
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`${heading} 닫기`}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading && <LoadingSpinner size="md" message="이력을 불러오는 중..." />}

      {!loading && error && (
        <div className="flex items-center justify-between gap-3 py-4">
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-secondary">
              재시도
            </button>
          )}
        </div>
      )}

      {!loading && !error && revisions.length === 0 && (
        <ListState>아직 수정된 적이 없습니다.</ListState>
      )}

      {!loading && !error && revisions.length > 0 && (
        <>
          <ul className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
            {revisions.map((r, i) => {
              const active = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      const next = active ? null : r.id;
                      setSelectedId(next);
                      // 새로 고른 판은 '이 편집에서 바뀐 것' 부터 본다
                      if (next !== null) setMode('prev');
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                      active
                        ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/30 dark:ring-primary-700'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {i === 0 && (
                        <span className="flex-shrink-0 rounded bg-primary-100 px-1.5 py-0.5 text-2xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                          최신
                        </span>
                      )}
                      <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200">
                        {r.title}
                      </span>
                    </div>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {formatDateTime(r.createdAt)}
                      <span className="mx-1.5">·</span>
                      {nameOf(r)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && pair ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode('prev')}
                  disabled={!previous}
                  aria-pressed={effectiveMode === 'prev'}
                  title={previous ? undefined : '가장 오래된 판이라 직전이 없습니다'}
                  className={`rounded-full px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    effectiveMode === 'prev'
                      ? 'bg-slate-800 font-medium text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  이 편집에서 바뀐 것
                </button>
                <button
                  type="button"
                  onClick={() => setMode('current')}
                  aria-pressed={effectiveMode === 'current'}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    effectiveMode === 'current'
                      ? 'bg-slate-800 font-medium text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  현재와 비교
                </button>

                {!previous && (
                  <span className="text-2xs text-slate-400">최초 작성이라 직전 판이 없습니다</span>
                )}

                {onRestore && (
                  <button
                    type="button"
                    onClick={() => onRestore(selected.content)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />이 판으로 복원
                  </button>
                )}
              </div>

              <ContentDiffViewer
                contentA={pair.a}
                contentB={pair.b}
                labelA={pair.labelA}
                labelB={pair.labelB}
              />
            </div>
          ) : (
            <p className="py-2 text-center text-xs text-slate-400">
              판을 고르면 그 편집에서 무엇이 바뀌었는지 보여줍니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
