import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WikiRevision } from '../../types/wiki.types';
import { getWikiPageHistory } from '../../api/wiki';
import { WikiDiffViewer } from './WikiDiffViewer';
import { formatDateTime } from '../../utils/date';

interface WikiHistoryProps {
  slug: string;
  currentContent: string;
  onRestore?: (content: string) => void;
}

export const WikiHistory: React.FC<WikiHistoryProps> = ({ slug, currentContent, onRestore }) => {
  const [revisions, setRevisions] = useState<WikiRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // slug 변경 시 선택 상태 초기화 (버그 1 수정)
  useEffect(() => {
    setSelectedId(null);
    setShowDiff(false);
  }, [slug]);

  const fetchHistory = useCallback(async () => {
    // 이전 요청이 진행 중이면 취소 (버그 3 수정)
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const data = await getWikiPageHistory(slug);
      if (!controller.signal.aborted) {
        setRevisions(data);
      }
    } catch {
      if (!controller.signal.aborted) {
        setError('수정 이력을 불러오는 데 실패했습니다.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [slug]);

  useEffect(() => {
    void fetchHistory();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchHistory]);

  const selected = revisions.find(r => r.id === selectedId) ?? null;

  const editorName = (r: WikiRevision) => r.editor?.name ?? r.editorId ?? '알 수 없음';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
        <svg
          className="w-4 h-4 mr-2 animate-spin"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        이력 불러오는 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between py-4">
        <p className="text-sm text-red-500">{error}</p>
        <button
          type="button"
          onClick={() => void fetchHistory()}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
        >
          재시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          편집 이력
          {revisions.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">({revisions.length}건)</span>
          )}
        </h3>
        {selected && (
          <button
            type="button"
            onClick={() => setShowDiff(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
          >
            {showDiff ? '이력 목록' : '변경 비교'}
          </button>
        )}
      </div>

      {showDiff && selected ? (
        <WikiDiffViewer
          versionA={{
            content: selected.content,
            editedBy: editorName(selected),
            editedAt: selected.createdAt,
          }}
          versionB={{ content: currentContent, editedBy: null, editedAt: new Date().toISOString() }}
          labelA={`${formatDateTime(selected.createdAt)} (${editorName(selected)})`}
          labelB="현재"
        />
      ) : (
        <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
          {revisions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">편집 이력이 없습니다.</p>
          ) : (
            revisions.map((r, i) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  selectedId === r.id
                    ? 'bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {i === 0 && (
                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 font-medium">
                        최신
                      </span>
                    )}
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{r.title}</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDateTime(r.createdAt)}
                    <span className="mx-1.5">·</span>
                    {editorName(r)}
                  </p>
                </div>
                {selectedId === r.id && (
                  <div className="flex gap-2 ml-3 flex-shrink-0">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setShowDiff(true);
                      }}
                      className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                    >
                      비교
                    </button>
                    {onRestore && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onRestore(r.content);
                        }}
                        className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 transition-colors"
                      >
                        복원
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
