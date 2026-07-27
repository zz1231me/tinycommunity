import React from 'react';

interface EmptyStateProps {
  debouncedSearchTerm: string;
  /** 선택된 태그 ID 수 — 태그 필터에 의한 빈 결과인지 식별 */
  selectedTagCount?: number;
  /** 태그 초기화 콜백 (태그 필터 빈 결과일 때 노출) */
  onClearTags?: () => void;
  onNewPost: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  debouncedSearchTerm,
  selectedTagCount = 0,
  onClearTags,
  onNewPost,
}) => {
  // ✅ 태그 필터로 인한 빈 결과 — 검색어보다 우선해서 안내 (검색+태그 동시는 검색을 먼저)
  if (!debouncedSearchTerm && selectedTagCount > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center mb-5">
          <svg
            aria-hidden="true"
            focusable="false"
            className="w-7 h-7 text-slate-400 dark:text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
          선택한 태그에 해당하는 글이 없습니다
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed mb-5">
          {selectedTagCount}개 태그로 필터링한 결과가 없습니다.
          <br />
          다른 태그를 선택하거나 필터를 초기화해보세요.
        </p>
        {onClearTags && (
          <button
            onClick={onClearTags}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            태그 필터 초기화
          </button>
        )}
      </div>
    );
  }

  if (debouncedSearchTerm) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center mb-5">
          <svg
            aria-hidden="true"
            focusable="false"
            className="w-7 h-7 text-slate-400 dark:text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
          검색 결과가 없습니다
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            &lsquo;{debouncedSearchTerm}&rsquo;
          </span>
          에 대한 게시글을 찾지 못했습니다.
          <br />
          다른 검색어를 입력해보세요.
          {selectedTagCount > 0 && (
            <>
              <br />
              <span className="text-xs text-slate-400">
                (태그 필터 {selectedTagCount}개 적용 중)
              </span>
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center mb-5">
        <svg
          aria-hidden="true"
          focusable="false"
          className="w-7 h-7 text-slate-400 dark:text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
        아직 게시글이 없습니다
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        첫 번째 게시글을 작성해보세요.
      </p>
      <button
        onClick={onNewPost}
        className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        첫 글 작성하기
      </button>
    </div>
  );
};
