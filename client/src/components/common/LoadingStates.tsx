// client/src/components/common/LoadingStates.tsx - 재사용 가능한 로딩/에러 상태 컴포넌트

import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  hint?: string;
  /** 스피너 크기 — sm: 16px (inline), md: 24px, lg: 48px (page-level 기본) */
  size?: 'sm' | 'md' | 'lg';
  /** message 없이 스피너만 렌더 (인라인 사용) */
  inline?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-12 w-12 border-b-2',
};

/**
 * 통합 로딩 스피너.
 * - `inline`: 텍스트 없이 작은 스피너 (버튼/리스트 아이템 안 등)
 * - 기본: 메시지 + 페이지 중앙 정렬
 *
 * 프로젝트 전반의 다양한 인라인 스피너를 이 컴포넌트로 대체해 시각 일관성 확보.
 */
export const LoadingSpinner = React.memo(
  ({
    message = '데이터를 불러오는 중...',
    hint,
    size = 'lg',
    inline = false,
  }: LoadingSpinnerProps) => {
    const spinner = (
      <div
        role="status"
        aria-label="로딩 중"
        className={`animate-spin rounded-full border-primary-600 border-t-transparent dark:border-primary-400 dark:border-t-transparent ${SIZE_CLASSES[size]}`}
      />
    );
    if (inline) return spinner;
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className={`mb-4 ${size !== 'lg' ? 'mb-3' : ''}`}>{spinner}</div>
        <p className="text-slate-600 dark:text-slate-400">{message}</p>
        {hint && <div className="mt-2 text-sm text-slate-400 dark:text-slate-500">{hint}</div>}
      </div>
    );
  }
);
LoadingSpinner.displayName = 'LoadingSpinner';

/**
 * 페이지 전체 스켈레톤 로더
 */
export const PageSkeleton: React.FC = () => (
  <div className="page-container overflow-y-auto">
    <div className="content-wrapper">
      <div className="mb-6 animate-pulse">
        <div className="h-10 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
      </div>
      <div className="card p-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-4"></div>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
          <div className="space-y-2">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16"></div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-4/6"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
        </div>
      </div>
    </div>
  </div>
);

interface PageNotFoundProps {
  onBack?: () => void;
}

export const PageNotFound: React.FC<PageNotFoundProps> = ({ onBack }) => (
  <div className="page-container overflow-y-auto">
    <div className="content-wrapper">
      <div className="card p-8 text-center max-w-md mx-auto">
        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-700/60 rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl select-none">
          🔍
        </div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
          찾을 수 없습니다
        </h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          요청하신 게시글이 존재하지 않거나 삭제되었습니다.
        </p>
        {onBack && (
          <button onClick={onBack} className="btn-primary">
            목록으로 돌아가기
          </button>
        )}
      </div>
    </div>
  </div>
);

interface PageErrorProps {
  message: string;
  onBack?: () => void;
  onRetry?: () => void;
}

/**
 * 페이지 에러 상태 (뒤로가기 + 재시도 버튼 포함)
 */
export const PageError: React.FC<PageErrorProps> = ({ message, onBack, onRetry }) => (
  <div className="page-container overflow-y-auto">
    <div className="content-wrapper">
      <div className="card p-8 text-center max-w-md mx-auto">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-red-600 dark:text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
          오류가 발생했습니다
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-center">
          {onRetry && (
            <button onClick={onRetry} className="btn-secondary">
              다시 시도
            </button>
          )}
          {onBack && (
            <button onClick={onBack} className="btn-primary">
              목록으로 돌아가기
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
);
