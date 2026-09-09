// client/src/components/PostHistory.tsx
// 게시글 수정 이력 — 버전 목록에서 하나를 고르면 현재 본문과의 차이를 보여준다.
// 위키 이력(WikiHistory)과 같은 흐름이며, Diff 렌더링은 ContentDiffViewer 를 공유한다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, X } from 'lucide-react';
import { fetchPostRevisions, type PostRevision } from '../api/posts';
import { ContentDiffViewer } from './common/ContentDiffViewer';
import { LoadingSpinner } from './admin/common/LoadingSpinner';
import { formatDateTime } from '../utils/date';

interface Props {
  boardType: string;
  postId: string;
  /** 비교 기준이 되는 현재 본문 */
  currentContent: string;
  onClose: () => void;
}

const editorName = (r: PostRevision) => r.editor?.name ?? '알 수 없음';

export default function PostHistory({ boardType, postId, currentContent, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const {
    data: revisions = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ['posts', boardType, postId, 'revisions'],
    queryFn: () => fetchPostRevisions(boardType, postId),
  });

  const selected = revisions.find(r => r.id === selectedId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <History className="w-4 h-4" />
          수정 이력
          {revisions.length > 0 && (
            <span className="text-xs font-normal text-slate-400">{revisions.length}개 버전</span>
          )}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="수정 이력 닫기"
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isPending && <LoadingSpinner message="이력을 불러오는 중..." />}

      {isError && (
        <p className="py-6 text-center text-sm text-red-500 dark:text-red-400">
          수정 이력을 불러오지 못했습니다.
        </p>
      )}

      {!isPending && !isError && revisions.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">
          아직 수정된 적이 없는 게시글입니다.
        </p>
      )}

      {revisions.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
            {revisions.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  selectedId === r.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span className="font-medium">{formatDateTime(r.createdAt)}</span>
                <span className={selectedId === r.id ? 'text-white/80' : 'text-slate-400'}>
                  {' · '}
                  {editorName(r)}
                </span>
                <div
                  className={`truncate mt-0.5 ${selectedId === r.id ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {r.title}
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <ContentDiffViewer
              contentA={selected.content}
              contentB={currentContent}
              labelA={`${formatDateTime(selected.createdAt)} (${editorName(selected)})`}
              labelB="현재"
            />
          ) : (
            <p className="text-xs text-center text-slate-400 py-2">
              버전을 선택하면 현재 본문과의 차이를 보여줍니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
