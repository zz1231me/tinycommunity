import React from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 접근성 라벨 (아이콘만 있는 검색창이므로 필수에 가까움) */
  ariaLabel?: string;
  /** 너비 등 추가 클래스 (예: 'w-40 sm:w-52', 'w-48') */
  className?: string;
  maxLength?: number;
}

/**
 * 공용 검색 입력 — 돋보기 아이콘 + 지우기 버튼이 있는 컴팩트 검색창.
 * 게시판 빠른 검색 / 파일명 검색 등 인라인 검색 UI를 하나로 통일.
 */
export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '검색...',
  ariaLabel = '검색',
  className = 'w-48',
  maxLength,
}) => (
  <div className="relative">
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      className={`pl-9 pr-9 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="검색어 지우기"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    )}
  </div>
);
